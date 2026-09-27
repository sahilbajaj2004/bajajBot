import { render } from "ink";
import { createElement } from "react";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "../src/ui/App.js";
import { FrameStdin, FrameStdout } from "./frame-stdout.js";
import { HOME_TMP } from "./harness.js";
import { CONFIG_ENV_VAR } from "../src/config/store.js";
import type { MouseInput } from "../src/ui/mouse.js";
import type { Config } from "../src/config/types.js";
import type { Session } from "../src/session/types.js";

const server = createServer((_request, response) => {
  response.setHeader("content-type", "text/event-stream");
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
  response.write("data: [DONE]\n\n");
  response.end();
});
await new Promise<void>((resolve) => server.listen(8798, "127.0.0.1", resolve));

// The whole point of BAJAJBOT_CONFIG: the config lives outside ~/.bajajbot.
const altConfigPath = join(HOME_TMP, "alt-config.json");
process.env[CONFIG_ENV_VAR] = altConfigPath;

const base: Config = {
  provider: "custom",
  apiKey: "k",
  baseUrl: "http://127.0.0.1:8798/v1",
  defaultModel: "mock/small",
  theme: "dusk",
};
/** Write the config file the app will /reload from. */
const writeAlt = (extra: Partial<Config> = {}, raw?: string): void => {
  mkdirSync(HOME_TMP, { recursive: true });
  writeFileSync(altConfigPath, raw ?? `${JSON.stringify({ ...base, ...extra }, null, 2)}\n`);
};
writeAlt();

const now = new Date().toISOString();
const sessionsDir = join(HOME_TMP, ".bajajbot", "sessions");
mkdirSync(sessionsDir, { recursive: true });
const start: Session = {
  id: "chat-reload",
  createdAt: now,
  updatedAt: now,
  model: "mock/small",
  title: "reload",
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

const WIDTH = 100;
const stdout = new FrameStdout(WIDTH, 30);
const app = render(createElement(App, { config: { ...base }, session: start, mouse: mouse as never }), {
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

/**
 * The status-bar row, found by its stable prefix rather than by counting from
 * the end - a note that wraps pushes the row around, and a test that reads the
 * wrong line fails for reasons that have nothing to do with the feature.
 */
function note(): string {
  return stdout.lines.find((line) => line.includes("Welcome to bajajbot")) ?? "";
}

async function type(text: string): Promise<void> {
  stream.push(text);
  await wait();
}

async function clearAndType(text: string): Promise<void> {
  for (let i = 0; i < 160; i += 1) await type("\x7f");
  for (const word of text.split(" ")) {
    await type(word);
    await type(" ");
  }
  await type("\x7f");
}

/** Run a slash command and wait for its note. */
async function command(text: string, settleMs = 500): Promise<void> {
  await clearAndType(text);
  await type("\r");
  await wait(settleMs);
  await sample();
}

/** Send a prompt as a turn and let it finish. */
async function send(text: string, settleMs = 900): Promise<void> {
  await clearAndType(text);
  await type("\r");
  await wait(settleMs);
  await sample();
}

console.log(`HOME=${HOME_TMP}`);
console.log(`config=${altConfigPath}`);

await sample();
check("boots", (stdout.lines[0] ?? "").includes("reload"), JSON.stringify(stdout.lines[0]));

// 1. Control: no routing rules yet, so a matching message is not routed.
await send("route me");
check("no routing before the reload", !/routed →/.test(note()), JSON.stringify(note()));

// 2. Write a routing rule to disk and /reload it in.
writeAlt({ routes: [{ pattern: "route me", model: "routed/m9", active: true }] });
await command("/reload");
const reloadNote = note();
check("reload marks the overridden file", /reloaded \(env\)/.test(reloadNote), JSON.stringify(reloadNote));
check("reload names the changed key", /1 changed: routes/.test(reloadNote), JSON.stringify(reloadNote));
check("the reload note fits one line", stdout.lines.filter((line) => line.includes("reloaded")).length === 1, JSON.stringify(stdout.lines.filter((line) => line.includes("reloaded"))));

// 3. The proof: the reloaded rule actually steers the next turn.
await send("route me");
check("the reloaded route rule is live", /routed → routed\/m9/.test(note()), JSON.stringify(note()));

// 4. A corrupt file must not brick the session.
writeAlt({}, "{ this is not json");
await command("/reload", 400);
check("a corrupt file is reported", /✗ reload failed|corrupted/.test(note()), JSON.stringify(note()));
await send("route me");
check("the working config survived the bad file", /routed → routed\/m9/.test(note()), JSON.stringify(note()));

// 5. Reloading an identical file says so, rather than claiming a change.
writeAlt({ routes: [{ pattern: "route me", model: "routed/m9", active: true }] });
await command("/reload");
check("an identical file reports no changes", /no changes/.test(note()), JSON.stringify(note()));

console.log("final note row:", JSON.stringify(note()));
app.unmount();
server.close();
process.exit(process.exitCode ?? 0);
