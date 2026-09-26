import { render } from "ink";
import { createElement } from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "../src/ui/App.js";
import { FrameStdin, FrameStdout } from "./frame-stdout.js";
import { HOME_TMP } from "./harness.js";
import type { MouseInput } from "../src/ui/mouse.js";
import { tabActionAt, tabLayout, normalizeTitle, type TabView } from "../src/ui/TabBar.js";
import type { Config } from "../src/config/types.js";
import type { Session } from "../src/session/types.js";

const now = new Date().toISOString();
const config: Config = { provider: "custom", apiKey: "k", baseUrl: "http://127.0.0.1:9/v1", defaultModel: "mock/small" };

function seed(id: string, title: string, marker: string): Session {
  const session: Session = {
    id,
    createdAt: now,
    updatedAt: now,
    model: "mock/small",
    title,
    messages: [
      { role: "user", content: `ask ${marker}`, timestamp: now },
      { role: "assistant", content: `answer ${marker}`, timestamp: now },
    ],
  };
  mkdirSync(join(HOME_TMP, ".bajajbot", "sessions"), { recursive: true });
  writeFileSync(join(HOME_TMP, ".bajajbot", "sessions", `${id}.json`), `${JSON.stringify(session, null, 2)}\n`);
  return session;
}

const startTab = seed("chat-start", "start tab", "STARTTAB");
seed("chat-two", "second tab", "SECONDTAB");

const listeners = new Set<(event: MouseInput) => void>();
const stream = new FrameStdin();
const mouse = {
  stream: stream as never,
  cleanup: () => listeners.clear(),
  on: (listener: (event: MouseInput) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const WIDTH = 90;
const stdout = new FrameStdout(WIDTH, 24);
const app = render(createElement(App, { config, session: startTab, mouse: mouse as never }), {
  stdout: stdout as never,
  stdin: stream as never,
  exitOnCtrlC: false,
  debug: true,
});

const wait = (ms = 90) => new Promise((resolve) => setTimeout(resolve, ms));
const has = (needle: string): boolean => stdout.plain.includes(needle);
const strip = (): string => {
  const row = (stdout.latest.split("\n")[0] ?? "").replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "|");
  return row.replace(/\|+/g, "|").replace(/^\|+|\|+$/g, "");
};
const check = (label: string, pass: boolean, detail?: string): void => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass || !detail ? "" : ` -- ${detail}`}`);
  if (!pass) process.exitCode = 1;
};

/**
 * Ink repaints only changed rows, so a captured write is a diff. Flipping the
 * reported width forces a resize, which makes Ink redraw the whole screen.
 */
async function sample(): Promise<string> {
  stdout.reset();
  stdout.columns = stdout.columns === WIDTH ? WIDTH - 1 : WIDTH;
  stdout.emit("resize");
  await wait(80);
  return strip();
}

/** SGR press at a 1-based cell, exactly what a terminal sends. */
async function click(x: number, y: number): Promise<void> {
  for (const listener of listeners) listener({ type: "press", button: 0, x, y });
  await wait();
}

/** Pointer move with no button held - what the terminal sends on hover. */
async function hover(x: number, y: number): Promise<void> {
  for (const listener of listeners) listener({ type: "motion", x, y });
  await wait();
}

async function press(text: string): Promise<void> {
  stream.push(text);
  await wait();
}

/** Build the views a known tab list would produce. */
const views = (titles: string[]): TabView[] =>
  titles.map((title, index) => ({ id: `t${index}`, title, running: false }));

/** The strip exactly as tabLayout says it must be painted. */
function expectedStrip(titles: string[], activeIndex: number, columns: number, showClose = false): string {
  const list = views(titles);
  const layout = tabLayout(list, `t${activeIndex}`, columns);
  const byId = new Map(list.map((tab) => [tab.id, tab]));
  let out = "";
  if (layout.hiddenLeft > 0) out += "‹ ";
  layout.visible.forEach((id, index) => {
    const tab = byId.get(id);
    const total = layout.widths[index];
    if (!tab || total === undefined) return;
    const active = id === `t${activeIndex}`;
    const title = total - 2 - (active ? 2 : 0);
    const body = normalizeTitle(tab.title).slice(0, title).padEnd(title);
    // Inactive: pad, title, pad. Active: pad, title, pad, gap, cross-or-blank.
    out += active ? ` ${body}  ${showClose ? "×" : " "}` : ` ${body} `;
  });
  if (layout.hiddenRight > 0) out += " ›";
  return `${out} + `;
}

/** Assert the painted strip matches the layout for a known tab list. */
async function expectStrip(
  label: string,
  titles: string[],
  activeIndex: number,
  showClose = false,
): Promise<string> {
  const painted = await sample();
  // Ink drops trailing padding on the last cell, so compare trimmed.
  const expected = expectedStrip(titles, activeIndex, stdout.columns, showClose);
  check(
    label,
    painted.trimEnd() === expected.trimEnd(),
    `painted=${JSON.stringify(painted)} expected=${JSON.stringify(expected)}`,
  );
  return painted;
}

console.log(`HOME=${HOME_TMP}`);

/**
 * 1-based column of the active tab's close cell. The cross is only painted on
 * hover, so its position comes from the layout: the trailing " + " button
 * starts two cells later.
 */
const closeColumnOf = (row: string): number => row.indexOf("+") - 1;

let row = await expectStrip("one tab paints as expected", ["start tab"], 0);
check("the + sits after the tabs", row.trimEnd().endsWith("+"));
check("the cross is hidden until hovered", !row.includes("×"), JSON.stringify(row));

// The + is the last three cells; its middle is the safest click target.
const plusColumn = row.indexOf("+") + 1;
await click(plusColumn, 1);
row = await expectStrip("clicking + opens a second tab", ["start tab", "new chat"], 1);

// Click the × on the now-active tab.
await click(closeColumnOf(row), 1);
row = await expectStrip("clicking × closes the active tab", ["start tab"], 0);
check("and the first tab is current again", has("answer STARTTAB"));

// Open a new tab, then click the first tab's body to select it.
await click(row.indexOf("+") + 1, 1);
row = await expectStrip("+ again gives two tabs", ["start tab", "new chat"], 1);
await click(row.indexOf("start tab") + 1, 1);
await expectStrip("clicking a background tab selects it", ["start tab", "new chat"], 0);
check("that tab's own history is shown", has("answer STARTTAB"));

// Clicking the active tab's body must not close it.
await click(row.indexOf("start tab") + 1, 1);
await expectStrip("clicking the active tab's body is a no-op", ["start tab", "new chat"], 0);

// A click in the chat body must not be swallowed by the tab strip.
await click(40, 12);
await press("z");
check("clicking the chat body leaves the strip alone", has("answer STARTTAB"));
await expectStrip("  and the tab list is unchanged", ["start tab", "new chat"], 0);

// Hit-testing agrees with the paint for every cell of the strip.
const list = views(["start tab", "new chat"]);
const layout = tabLayout(list, "t0", stdout.columns);
let cursor = 0;
let mismatches = 0;
layout.visible.forEach((id, index) => {
  const total = layout.widths[index] ?? 0;
  for (let cell = 0; cell < total; cell += 1) {
    const action = tabActionAt(cursor + cell, list, "t0", stdout.columns);
    // Only the active tab ends in a close button.
    const wanted = id === "t0" && cell === total - 1 ? "close" : "select";
    if (!action || action.kind !== wanted) mismatches += 1;
  }
  cursor += total;
});
check("every painted cell maps to the action it looks like", mismatches === 0, `${mismatches} mismatched cells`);
check("the trailing + maps to new", tabActionAt(cursor + 1, list, "t0", stdout.columns)?.kind === "new");

// Closing every tab must never leave zero tabs. The active tab goes first, so
// the empty tab is what survives.
for (let round = 0; round < 5; round += 1) {
  const current = await sample();
  await click(closeColumnOf(current), 1);
}
await expectStrip("closing every tab leaves one open", ["new chat"], 0);

// --- hover reveals the cross -------------------------------------------------
console.log("--- hover ---");
row = await sample();
check("the cross starts hidden", !row.includes("×"), JSON.stringify(row));

// The active tab reserves two cells before the +: a gap and the cross.
const closeColumn = closeColumnOf(row);
await hover(closeColumn, 1);
row = await expectStrip("hovering the close cell reveals the cross", ["new chat"], 0, true);
check("the cross is visible on hover", row.includes("×"));

// Revealing it must not move anything.
check(
  "revealing the cross does not shift the strip",
  row.indexOf("+") === closeColumn + 1,
  `plus at ${row.indexOf("+")}, close at ${closeColumn}`,
);

await hover(closeColumn, 12);
await expectStrip("moving off the strip hides it again", ["new chat"], 0, false);

await hover(3, 1);
check("hovering the tab body leaves it hidden", !(await sample()).includes("×"));

// And it is still clickable while revealed.
await hover(closeColumn, 1);
row = await sample();
check("cross visible before the click", row.includes("×"));
await click(closeColumnOf(row), 1);
check("the revealed cross still closes the tab", (await sample()).includes("new chat"));

console.log("final strip:", JSON.stringify(await sample()));
app.unmount();
process.exit(process.exitCode ?? 0);
