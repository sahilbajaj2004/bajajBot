import { render } from "ink";
import { createElement } from "react";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "../src/ui/App.js";
import { FrameStdin, FrameStdout } from "./frame-stdout.js";
import { HOME_TMP } from "./harness.js";
import type { MouseInput } from "../src/ui/mouse.js";
import type { Config } from "../src/config/types.js";
import type { Session } from "../src/session/types.js";

const server = createServer((_request, response) => {
  response.setHeader("content-type", "text/event-stream");
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
  response.write("data: [DONE]\n\n");
  response.end();
});
await new Promise<void>((resolve) => server.listen(8796, "127.0.0.1", resolve));

const now = new Date().toISOString();
const config: Config = {
  provider: "custom",
  apiKey: "k",
  baseUrl: "http://127.0.0.1:8796/v1",
  defaultModel: "mock/small",
};

const sessionsDir = join(HOME_TMP, ".bajajbot", "sessions");
mkdirSync(sessionsDir, { recursive: true });
const start: Session = {
  id: "chat-notes-a",
  createdAt: now,
  updatedAt: now,
  model: "mock/small",
  title: "tab A",
  messages: [
    { role: "user", content: "alpha", timestamp: now },
    { role: "assistant", content: "first answer", timestamp: now },
  ],
};
writeFileSync(join(sessionsDir, `${start.id}.json`), `${JSON.stringify(start, null, 2)}\n`);

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
const app = render(createElement(App, { config, session: start, mouse: mouse as never }), {
  stdout: stdout as never,
  stdin: stream as never,
  exitOnCtrlC: false,
  debug: true,
});

const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (label: string, pass: boolean, detail?: string): void => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass || !detail ? "" : ` -- ${detail}`}`);
  if (!pass) process.exitCode = 1;
};

async function sample(): Promise<void> {
  stdout.reset();
  stdout.columns = stdout.columns === WIDTH ? WIDTH - 1 : WIDTH;
  stdout.emit("resize");
  await wait(70);
}

async function type(text: string): Promise<void> {
  stream.push(text);
  await wait();
}

/** The status-bar row, where notes are rendered. */
function statusBar(): string {
  return stdout.lines.at(-2) ?? "";
}

/** A note raised by /ollama; it fails fast and says "Ollama" either way. */
const NOTE = /ollama/i;
const HAS_STATUS_BAR = "Welcome to bajajbot";

/** Both tabs must be real chats (not the splash) for these checks to mean anything. */
async function requireStatusBars(where: string): Promise<void> {
  check(`${where} renders a status bar`, statusBar().includes(HAS_STATUS_BAR), JSON.stringify(statusBar()));
}

async function raiseNote(): Promise<void> {
  await type("/ollama");
  await type("\r");
  await wait(150);
  await sample();
}

console.log(`HOME=${HOME_TMP}`);

await sample();
check("boots on tab A", (stdout.lines[0] ?? "").includes("tab A"), JSON.stringify(stdout.lines[0]));

// /branch opens a second, NON-EMPTY tab, so both tabs have a status bar.
await type("/branch");
await type("\r");
await wait(400);
await sample();
check("two tabs are open", ((stdout.lines[0] ?? "").match(/first answer|tab A/g) ?? []).length >= 1, JSON.stringify(stdout.lines[0]));
await requireStatusBars("tab B (the fork)");

// Raise a note in tab B, then move to tab A.
await raiseNote();
check("tab B shows the note", NOTE.test(statusBar()), JSON.stringify(statusBar()));

await type("\x1b[1;5D"); // ctrl+left -> tab A
await wait(200);
await sample();
check("moved to tab A", (stdout.lines[0] ?? "").includes("tab A"), JSON.stringify(stdout.lines[0]));
await requireStatusBars("tab A");
check("tab A does NOT show tab B's note", !NOTE.test(statusBar()), JSON.stringify(statusBar()));

// Let it go stale, then return: no resurrection.
await wait(2600);
await type("\x1b[1;5C"); // ctrl+right -> tab B
await wait(200);
await sample();
await requireStatusBars("tab B (again)");
check("the stale note is not resurrected in tab B", !NOTE.test(statusBar()), JSON.stringify(statusBar()));

// A fresh note in tab A still shows there, and still not in tab B.
await type("\x1b[1;5D");
await wait(200);
await sample();
await raiseNote();
check("tab A can raise its own note", NOTE.test(statusBar()), JSON.stringify(statusBar()));
await type("\x1b[1;5C");
await wait(200);
await sample();
await requireStatusBars("tab B (final)");
check("tab B stays clean", !NOTE.test(statusBar()), JSON.stringify(statusBar()));

console.log("final strip:", JSON.stringify(stdout.lines[0]));
app.unmount();
server.close();
process.exit(process.exitCode ?? 0);
