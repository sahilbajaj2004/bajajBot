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

/** Marker no system prompt contains, so only the turn naming it hangs. */
const HANG = "zzz-hang-me-zzz";

const server = createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    let latest = "";
    try {
      const body = JSON.parse(raw) as { messages?: { role: string; content: string }[] };
      const users = (body.messages ?? []).filter((m) => m.role === "user");
      latest = users[users.length - 1]?.content ?? "";
    } catch {
      latest = "";
    }
    if (latest.includes(HANG)) return; // never responds: holds the batch open
    response.setHeader("content-type", "text/event-stream");
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
    response.write("data: [DONE]\n\n");
    response.end();
  });
});
await new Promise<void>((resolve) => server.listen(8797, "127.0.0.1", resolve));

const now = new Date().toISOString();
const config: Config = {
  provider: "custom",
  apiKey: "k",
  baseUrl: "http://127.0.0.1:8797/v1",
  defaultModel: "mock/small",
};

const sessionsDir = join(HOME_TMP, ".bajajbot", "sessions");
mkdirSync(sessionsDir, { recursive: true });
const start: Session = {
  id: "chat-sa-model",
  createdAt: now,
  updatedAt: now,
  model: "mock/small",
  title: "subagent models",
  messages: [
    { role: "user", content: "hello", timestamp: now },
    { role: "assistant", content: "hi", timestamp: now },
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

const WIDTH = 110;
const stdout = new FrameStdout(WIDTH, 40);
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

/** The whole visible transcript, where the chips and report cards are drawn. */
function frame(): string {
  return stdout.lines.join("\n");
}

/** The subagent rows in view, for readable failure output. */
function rows(): string {
  return JSON.stringify(stdout.lines.filter((line) => /subagent|\[\d\]/.test(line)), null, 0);
}

async function type(text: string): Promise<void> {
  stream.push(text);
  await wait();
}

/** Clear the composer, type a command (words are split so no key is eaten), run it. */
async function runCommand(command: string): Promise<void> {
  for (let i = 0; i < 140; i += 1) await type("\x7f");
  for (const word of command.split(" ")) {
    await type(word);
    await type(" ");
  }
  await type("\x7f");
  await type("\r");
  await wait(1400);
  await sample();
}

console.log(`HOME=${HOME_TMP}`);

await sample();
check("boots", frame().includes("subagent models"), JSON.stringify(stdout.lines[0]));

// 1. Live chips for a uniform batch: the header names the session's model, and
//    no unit repeats it.
await runCommand(`/subagent ${HANG} hang, quick`);
const uniform = frame();
check("live chip header is drawn", uniform.includes("⟳ subagents"), rows());
check("the header names the model", /⟳ subagents · mock\/small ·/.test(uniform), rows());
check("both tasks are listed", uniform.includes("hang") && uniform.includes("quick"), rows());
check("a uniform batch does not tag each unit", !/\[\d\] [^@]*@\S+ -/.test(uniform), rows());
check("the hung unit is still running", /⠇?\[?.*\[1\] [^\n]* - …/.test(uniform), rows());

// Cancel, and let the folded report land before starting the next batch - a
// second /subagent is refused while any unit is still live.
await type("\x1b");
await wait(1600);
await sample();
check("the report names the session model", /subagent report · 2 tasks · mock\/small/.test(frame()), rows());
check("a uniform report tags nothing", !/\[\d\] [^\n]*@/.test(frame()), rows());

// 2. Live chips for a mixed batch: --model sets the batch, one task overrides.
await runCommand(`/subagent --model big/m2 ${HANG} gamma, cheap/m1::delta`);
const mixed = frame();
check("a mixed batch is labelled 2 models", mixed.includes("⟳ subagents · 2 models ·"), rows());
// The hanging unit's task text carries the marker, so match the tail of it.
check("the batch model reaches the unit", /gamma @big\/m2 -/.test(mixed), rows());
check("the override reaches its unit", /\[\d\] delta @cheap\/m1 -/.test(mixed), rows());
check(
  "every unit in a mixed batch names its own model",
  [...mixed.matchAll(/(\[\d\] [^@\n]*@\S+ -)/g)].length >= 2,
  rows(),
);

await type("\x1b");
await wait(1600);
await sample();
const report = frame();
check("the report names a mixed batch", /subagent report · 2 tasks · 2 models/.test(report), rows());
check("the report tags the mixed units", /delta @cheap\/m1/.test(report) && /gamma @big\/m2/.test(report), rows());

console.log("rows seen:");
for (const row of stdout.lines.filter((line) => /subagent|\[\d\]/.test(line))) {
  console.log("  " + JSON.stringify(row));
}

app.unmount();
server.close();
process.exit(process.exitCode ?? 0);
