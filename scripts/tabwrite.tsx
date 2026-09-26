import { render } from "ink";
import { createElement } from "react";
import { createServer } from "node:http";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "../src/ui/App.js";
import { FrameStdin, FrameStdout } from "./frame-stdout.js";
import { HOME_TMP } from "./harness.js";
import type { MouseInput } from "../src/ui/mouse.js";
import type { Config } from "../src/config/types.js";
import type { Session } from "../src/session/types.js";

/** Marker no system prompt will contain, so only our test turn hangs. */
const HANG = "zzz-hang-me-zzz";

/**
 * Mock endpoint: answers normally, but never replies to a request containing
 * the hang marker, so a turn can be held in flight as long as the test needs.
 */
const server = createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    if (raw.includes(HANG)) return; // left open on purpose
    response.setHeader("content-type", "text/event-stream");
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
    response.write("data: [DONE]\n\n");
    response.end();
  });
});
await new Promise<void>((resolve) => server.listen(8791, "127.0.0.1", resolve));

const now = new Date().toISOString();
const config: Config = {
  provider: "custom",
  apiKey: "k",
  baseUrl: "http://127.0.0.1:8791/v1",
  defaultModel: "mock/small",
};

const sessionsDir = join(HOME_TMP, ".bajajbot", "sessions");
mkdirSync(sessionsDir, { recursive: true });

// The chat the user is looking at when they click +.
const existing: Session = {
  id: "chat-existing",
  createdAt: now,
  updatedAt: now,
  model: "mock/small",
  title: "existing chat",
  messages: [
    { role: "user", content: "old question", timestamp: now },
    { role: "assistant", content: "old answer", timestamp: now },
  ],
};
writeFileSync(join(sessionsDir, "chat-existing.json"), `${JSON.stringify(existing, null, 2)}\n`);

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

const stdout = new FrameStdout(90, 24);
const app = render(createElement(App, { config, session: existing, mouse: mouse as never }), {
  stdout: stdout as never,
  stdin: stream as never,
  exitOnCtrlC: false,
  debug: true,
});

const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const has = (needle: string): boolean => stdout.plain.includes(needle);
const strip = (): string => {
  const row = (stdout.latest.split("\n")[0] ?? "").replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "|");
  return row.replace(/\|+/g, "|").replace(/^\|+|\|+$/g, "");
};
const check = (label: string, pass: boolean, detail?: string): void => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass || !detail ? "" : ` -- ${detail}`}`);
  if (!pass) process.exitCode = 1;
};

async function sample(): Promise<string> {
  stdout.reset();
  stdout.columns = stdout.columns === 90 ? 89 : 90;
  stdout.emit("resize");
  await wait(80);
  return strip();
}

async function click(x: number, y: number): Promise<void> {
  for (const listener of listeners) listener({ type: "press", button: 0, x, y });
  await wait();
}

async function press(text: string): Promise<void> {
  stream.push(text);
  await wait();
}

/** Every session file on disk, with the first user message it holds. */
function onDisk(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of readdirSync(sessionsDir).filter((name) => name.endsWith(".json"))) {
    const session = JSON.parse(readFileSync(join(sessionsDir, file), "utf8")) as Session;
    out[session.id] = session.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content.slice(0, 24))
      .join(" | ");
  }
  return out;
}

console.log(`HOME=${HOME_TMP}`);
console.log("before:", JSON.stringify(onDisk()));

const row = await sample();
console.log("strip:", JSON.stringify(row));
const plusColumn = row.indexOf("+") + 1;
await click(plusColumn, 1);
const after = await sample();
console.log("after +:", JSON.stringify(after), "plus column:", plusColumn);
check("clicking + shows a second tab", after.includes("new chat"));
check("no new message is written by opening a tab", !Object.values(onDisk()).some((line) => line.includes("fresh message")));

// Now type into the new tab and send.
await press("fresh message");
await press("\r");
await wait(1200);
await sample();

const disk = onDisk();
console.log("after send:", JSON.stringify(disk, null, 2));
check(
  "the new tab's message is not written into the old chat",
  !(disk["chat-existing"] ?? "").includes("fresh message"),
  `old=${disk["chat-existing"]}`,
);
const landed = Object.entries(disk).find(
  ([id, lines]) => id !== "chat-existing" && lines.includes("fresh message"),
);
check("the new tab's message lands in its own session", Boolean(landed), JSON.stringify(disk));
check(
  "the old chat still holds exactly its own message",
  (disk["chat-existing"] ?? "") === "old question",
  `old=${disk["chat-existing"]}`,
);

// The regression: while a turn is in flight, + and tab clicks must be refused.
// Otherwise the finishing turn hijacks the live view and the user's next
// message lands in the old chat. The mock endpoint holds this turn open.
console.log("--- + while a turn is in flight ---");
await press(HANG);
await press("\r");
await wait(400);
const streaming = await sample();
check("the turn is running", has(HANG), JSON.stringify(streaming.slice(0, 60)));

const plusWhileBusy = streaming.indexOf("+") + 1;
await click(plusWhileBusy, 1);
const refused = await sample();
check("clicking + mid-turn is refused", (refused.match(/new chat/g) ?? []).length === 0, JSON.stringify(refused));
check("the refusal is explained", has("interrupt the turn"), JSON.stringify(stdout.lines.slice(-3)));

// Clicking the other tab mid-turn must be refused too.
await click(refused.indexOf("existing chat") + 2, 1);
const stillHere = await sample();
check("clicking another tab mid-turn is refused", has(HANG), JSON.stringify(stillHere.slice(0, 60)));
check("and it says so", has("interrupt the turn"));

// The turn belongs to the tab that started it, and the old chat never saw it.
check("the turn's own tab still shows it", has(HANG));
check("the old chat is untouched", !(onDisk()["chat-existing"] ?? "").includes(HANG));

console.log("strip:", JSON.stringify(await sample()));
app.unmount();
server.close();
process.exit(process.exitCode ?? 0);
