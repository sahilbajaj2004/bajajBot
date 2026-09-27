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

/** Marker no system prompt contains, so only our test turn hangs. */
const HANG = "zzz-hang-me-zzz";

/** Every prompt the endpoint was asked about, in order. */
const seen: string[] = [];

const server = createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    for (const prompt of ["first prompt", "second prompt", "third prompt", "drain one", "drain two"]) {
      if (raw.includes(prompt)) seen.push(prompt);
    }
    // Hang only on the newest user message - the marker stays in the history,
    // so matching the whole body would hang every later turn too.
    let latest = "";
    try {
      const body = JSON.parse(raw) as { messages?: { role: string; content: string }[] };
      const users = (body.messages ?? []).filter((m) => m.role === "user");
      latest = users[users.length - 1]?.content ?? "";
    } catch {
      latest = "";
    }
    if (latest.includes(HANG)) return; // left open on purpose
    response.setHeader("content-type", "text/event-stream");
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
    response.write("data: [DONE]\n\n");
    response.end();
  });
});
await new Promise<void>((resolve) => server.listen(8793, "127.0.0.1", resolve));

const now = new Date().toISOString();
const config: Config = {
  provider: "custom",
  apiKey: "k",
  baseUrl: "http://127.0.0.1:8793/v1",
  defaultModel: "mock/small",
};

const sessionsDir = join(HOME_TMP, ".bajajbot", "sessions");
mkdirSync(sessionsDir, { recursive: true });
const session: Session = {
  id: "chat-queue",
  createdAt: now,
  updatedAt: now,
  model: "mock/small",
  title: "queue test",
  messages: [],
};
writeFileSync(join(sessionsDir, "chat-queue.json"), `${JSON.stringify(session, null, 2)}\n`);

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
const app = render(createElement(App, { config, session, mouse: mouse as never }), {
  stdout: stdout as never,
  stdin: stream as never,
  exitOnCtrlC: false,
  debug: true,
});

const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const has = (needle: string): boolean => stdout.plain.includes(needle);
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

/**
 * The bottom of the frame: the input box plus the status bar. Matching on the
 * placeholder alone breaks once the box holds real text.
 */
function composer(): string {
  return stdout.lines.slice(-6).join("\n");
}

/** The status bar's queue counter, e.g. "1 queued". */
function queueCounter(): string {
  return stdout.lines.at(-2)?.match(/· (\d+) queued/)?.[1] ?? "0";
}

console.log(`HOME=${HOME_TMP}`);

// Turn 1 hangs so we can queue behind it.
await type(`${HANG} first prompt`);
await type("\r");
await wait(300);
await sample();
check("first turn is in flight", has(HANG), JSON.stringify(stdout.lines.slice(0, 2)));

// Queue two more prompts behind it.
await type("second prompt");
await type("\r");
await type("third prompt");
await type("\r");
await wait(150);
await sample();
check("two prompts are queued", /2 queued/.test(stdout.plain), JSON.stringify(composer()));
check("the composer was cleared while queueing", !has("second prompt"), JSON.stringify(composer()));

// Interrupt: first esc arms, second aborts (2500ms window).
await type("\x1b");
await wait(120);
await sample();
check("first esc only arms", /interrupt/.test(stdout.plain), JSON.stringify(stdout.lines.at(-2) ?? ""));
await type("\x1b");
await wait(600);
await sample();

check("queued prompts came back to the input", composer().includes("second prompt") && composer().includes("third prompt"), JSON.stringify(composer()));
check("the running prompt did not come back", !composer().includes(HANG), JSON.stringify(composer()));
check("the queue counter is back to zero", queueCounter() === "0", `counter=${queueCounter()} status=${JSON.stringify(stdout.lines.at(-2) ?? "")}`);
check("the user is told what happened", /back in the input/.test(stdout.plain), JSON.stringify(stdout.lines.at(-2) ?? ""));
check("no queued prompt was sent behind their back", !seen.includes("second prompt") && !seen.includes("third prompt"), JSON.stringify(seen));
check("only the first prompt reached the model", seen.length === 1, JSON.stringify(seen));

// A clean finish must still drain the queue.
console.log("--- normal completion still drains ---");
seen.length = 0;
for (let i = 0; i < 60; i += 1) await type("\x7f");
await wait(150);
check("the composer is empty before retrying", /Type a message/.test(composer()), JSON.stringify(composer()));
await type("drain one");
await type("\r");
await wait(150);
await type("drain two");
await type("\r");
await wait(1500);
await sample();
check("both queued prompts were sent", seen.includes("drain one") && seen.includes("drain two"), JSON.stringify(seen));
check("the queue drained empty", queueCounter() === "0", `counter=${queueCounter()} status=${JSON.stringify(stdout.lines.at(-2) ?? "")}`);

console.log("final composer:", JSON.stringify(composer()));
app.unmount();
server.close();
process.exit(process.exitCode ?? 0);
