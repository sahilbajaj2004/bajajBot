import { render } from "ink";
import { createElement } from "react";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "../src/ui/App.js";
import { FrameStdin, FrameStdout } from "./frame-stdout.js";
import { HOME_TMP } from "./harness.js";
import { configPath } from "../src/config/store.js";
import type { MouseInput } from "../src/ui/mouse.js";
import type { Config } from "../src/config/types.js";
import type { Message } from "../src/session/types.js";
import type { Session } from "../src/session/types.js";

const server = createServer((_request, response) => {
  response.setHeader("content-type", "text/event-stream");
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
  response.write("data: [DONE]\n\n");
  response.end();
});
await new Promise<void>((resolve) => server.listen(8799, "127.0.0.1", resolve));

const now = new Date().toISOString();
const config: Config = {
  provider: "custom",
  apiKey: "k",
  baseUrl: "http://127.0.0.1:8799/v1",
  defaultModel: "mock/small",
};

/** A transcript with a tool call and a multi-line result, seeded straight to disk. */
const resultBody = [
  "const alpha = 1;",
  "const beta = 2;",
  "const gamma = 3;",
  "return { alpha, beta, gamma };",
];
const messages: Message[] = [
  { role: "user", content: "read the parser", timestamp: now },
  {
    role: "assistant",
    content: "",
    timestamp: now,
    toolCalls: [
      { id: "t1", name: "read", args: JSON.stringify({ path: "src/parser.ts", limit: 40 }) },
    ],
  },
  { role: "tool", content: resultBody.join("\n"), timestamp: now, toolCallId: "t1" },
  { role: "assistant", content: "It returns all three.", timestamp: now },
];

const sessionsDir = join(HOME_TMP, ".bajajbot", "sessions");
mkdirSync(sessionsDir, { recursive: true });
const start: Session = {
  id: "chat-verbosity",
  createdAt: now,
  updatedAt: now,
  model: "mock/small",
  title: "verbosity",
  messages,
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
const stdout = new FrameStdout(WIDTH, 34);
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
  await wait(80);
}

async function type(text: string): Promise<void> {
  stream.push(text);
  await wait();
}

/** Everything the chat drew, with ANSI stripped. */
function transcript(): string {
  return stdout.lines.join("\n").replace(/\[[0-9;?]*[A-Za-z]/g, "");
}

/** The status-bar row, found by its stable prefix. */
function note(): string {
  return stdout.lines.find((line) => line.includes("Welcome to bajajbot")) ?? "";
}

/** What the config file on disk currently says. */
function savedVerbosity(): unknown {
  try {
    return (JSON.parse(readFileSync(configPath(), "utf8")) as Config).verbosity;
  } catch {
    return "<unreadable>";
  }
}

async function runVerbose(): Promise<void> {
  for (let i = 0; i < 60; i += 1) await type("\x7f");
  await type("/verbose");
  await type("\r");
  await wait(300);
  await sample();
}

const ARG = '"limit": 40';
const BODY = "const gamma = 3;";

console.log(`HOME=${HOME_TMP}`);

await sample();
check("boots", transcript().includes("verbosity"), JSON.stringify(stdout.lines[0]));

// 1. Default (quiet): one line per call and result, no argument or body detail.
check("the tool call is summarised", transcript().includes("⚙ read"), transcript());
check("quiet hides the arguments", !transcript().includes(ARG), transcript());
check("quiet hides the result body", !transcript().includes(BODY), transcript());

// 2. normal: full arguments, still no result body.
await runVerbose();
check("the level is reported", /verbosity: normal/.test(note()), JSON.stringify(note()));
check("normal shows the arguments", transcript().includes(ARG), transcript());
check("normal still hides the result body", !transcript().includes(BODY), transcript());
check("the level is persisted", savedVerbosity() === "normal", String(savedVerbosity()));

// 3. verbose: the whole result body too.
await runVerbose();
check("the level is reported", /verbosity: verbose/.test(note()), JSON.stringify(note()));
check("verbose shows the result body", transcript().includes(BODY), transcript());
check("the summary line is not duplicated", transcript().split("const alpha = 1;").length === 2, transcript());
check("the level is persisted", savedVerbosity() === "verbose", String(savedVerbosity()));

// 4. Cycling back to quiet restores the one-line transcript.
await runVerbose();
check("it cycles back to quiet", /verbosity: quiet/.test(note()), JSON.stringify(note()));
check("quiet hides the arguments again", !transcript().includes(ARG), transcript());
check("quiet hides the result body again", !transcript().includes(BODY), transcript());

// 5. The reply text is never affected by the level.
check("assistant text still renders", transcript().includes("It returns all three."), transcript());

console.log("transcript at quiet:");
for (const row of stdout.lines.filter((line) => /⚙|↳|read the parser|returns all three/.test(line))) {
  console.log("  " + JSON.stringify(row.replace(/\[[0-9;?]*[A-Za-z]/g, "")));
}

app.unmount();
server.close();
process.exit(process.exitCode ?? 0);
