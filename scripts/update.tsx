import { render } from "ink";
import { createElement } from "react";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "../src/ui/App.js";
import { FrameStdin, FrameStdout } from "./frame-stdout.js";
import { HOME_TMP } from "./harness.js";
import type { MouseInput } from "../src/ui/mouse.js";
import type { Updater } from "../src/util/updater.js";
import type { Config } from "../src/config/types.js";
import type { Session } from "../src/session/types.js";

const server = createServer((_request, response) => {
  response.setHeader("content-type", "text/event-stream");
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
  response.write("data: [DONE]\n\n");
  response.end();
});
await new Promise<void>((resolve) => server.listen(8800, "127.0.0.1", resolve));

const now = new Date().toISOString();
const config: Config = {
  provider: "custom",
  apiKey: "k",
  baseUrl: "http://127.0.0.1:8800/v1",
  defaultModel: "mock/small",
};

const sessionsDir = join(HOME_TMP, ".bajajbot", "sessions");
mkdirSync(sessionsDir, { recursive: true });
const start: Session = {
  id: "chat-update",
  createdAt: now,
  updatedAt: now,
  model: "mock/small",
  title: "update",
  messages: [
    { role: "user", content: "hi", timestamp: now },
    { role: "assistant", content: "hello", timestamp: now },
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

const WIDTH = 100;
const stdout = new FrameStdout(WIDTH, 30);

// A stand-in for npm: scripted timings, so the progress display is exercised
// without a real registry or a real global install. Declared before the render
// because the App takes it as a prop.
const installCalls: string[] = [];
const marked: string[] = [];
const fake = {
  latestVersion: "3.1.0" as string | null,
  failWith: null as { code: number; tail: string[] } | null,
  async latest(): Promise<string | null> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return this.latestVersion;
  },
  async install(version: string, onProgress: (detail: string) => void) {
    installCalls.push(version);
    onProgress("npm warn deprecated foo@1.0.0");
    await new Promise((resolve) => setTimeout(resolve, 200));
    onProgress("npm http fetch GET 200 registry.npmjs.org/bajajbot 1.2s");
    await new Promise((resolve) => setTimeout(resolve, 1800));
    onProgress("added 42 packages in 4s");
    if (this.failWith) {
      return { ok: false, code: this.failWith.code, tail: this.failWith.tail };
    }
    return { ok: true, code: 0, tail: ["added 42 packages in 4s"] };
  },
  markChecked(version: string): void {
    marked.push(version);
  },
};

const app = render(
  createElement(App, {
    config,
    session: start,
    mouse: mouse as never,
    version: "3.0.0",
    updater: fake as Updater,
  }),
  { stdout: stdout as never, stdin: stream as never, exitOnCtrlC: false, debug: true },
);

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

function frame(): string {
  return stdout.lines.join("\n").replace(/\[[0-9;?]*[A-Za-z]/g, "");
}

function note(): string {
  return stdout.lines.find((line) => line.includes("Welcome to bajajbot")) ?? "";
}

/** The two lines the update block draws. */
function updateBlock(): string {
  return stdout.lines.filter((line) => line.includes("⬆ update") || /^\s{2}[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✓✗] /.test(line.replace(/\[[0-9;?]*[A-Za-z]/g, ""))).join("\n");
}

async function runUpdate(settleMs: number): Promise<void> {
  for (let i = 0; i < 60; i += 1) await type("\x7f");
  await type("/update");
  await type("\r");
  await wait(settleMs);
  await sample();
}

console.log(`HOME=${HOME_TMP}`);

await sample();
check("boots", frame().includes("update"), JSON.stringify(stdout.lines[0]));
check("no update block before the command", !frame().includes("⬆ update"), updateBlock());

// 1. A newer version: progress is visible while the install runs.
await runUpdate(500);
check("the block names the version transition", /⬆ update 3\.0\.0 → 3\.1\.0/.test(frame()), updateBlock());
// A spinner frame only exists while the install is in flight.
check("a spinner shows it is working", /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] /.test(frame()), updateBlock());
check(
  "npm's latest line is shown as progress",
  /npm (warn deprecated|http fetch GET)/.test(frame()),
  updateBlock(),
);
check("the elapsed time ticks", /\d+\.\d+s/.test(frame()), updateBlock());

// 2. It finishes, and says a restart is needed.
await wait(2500);
await sample();
check("success is marked", /✓ installed - restart bajajbot/.test(frame()), updateBlock());
check("the note asks for a restart", /restart to use$/.test(note()), JSON.stringify(note()));
check("no note is truncated", !/to run$/.test(note()), JSON.stringify(note()));
check("the startup marker was refreshed", marked.length === 1, JSON.stringify(marked));

// 3. Nothing newer: a clean up-to-date answer.
fake.latestVersion = "3.0.0";
await runUpdate(700);
check("up to date is reported", /is the latest published/.test(frame()), updateBlock());
check("no install was attempted", installCalls.length === 1, JSON.stringify(installCalls));

// 4. An unreachable registry.
fake.latestVersion = null;
await runUpdate(700);
check("an unreachable registry is reported", /registry could not be reached/.test(frame()), updateBlock());

// 5. A failed install surfaces the reason, not a crash.
fake.latestVersion = "3.2.0";
fake.failWith = { code: 243, tail: ["npm ERR! code EACCES", "permission denied"] };
await runUpdate(2500);
check("the failure reason is shown", /retry with sudo/.test(frame()), updateBlock());
check("the failure is marked, not reported as success", !/✓ installed/.test(frame()), updateBlock());
check("the failure note is short and untruncated", /^✓|✗ update to v3\.2\.0 failed$/.test(note().trim().split(/\s{2,}/).pop() ?? ""), JSON.stringify(note()));

console.log("final block:\n" + updateBlock());
app.unmount();
server.close();
process.exit(process.exitCode ?? 0);
