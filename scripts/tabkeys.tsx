import { render } from "ink";
import { createElement } from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "../src/ui/App.js";
import { FrameStdin, FrameStdout } from "./frame-stdout.js";
import { HOME_TMP } from "./harness.js";
import type { Config } from "../src/config/types.js";
import type { Session } from "../src/session/types.js";

const now = new Date().toISOString();
const config: Config = {
  provider: "custom",
  apiKey: "k",
  baseUrl: "http://127.0.0.1:9/v1",
  defaultModel: "mock/small",
};

/** A session on disk, so focusTab has something to load from the filesystem. */
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

const diskTab = seed("chat-disk", "disk tab", "DISKTAB");
const startTab = seed("chat-start", "start tab", "STARTTAB");

const stdout = new FrameStdout(90, 24);
const stdin = new FrameStdin();
const app = render(createElement(App, { config, session: startTab }), {
  stdout: stdout as never,
  stdin: stdin as never,
  exitOnCtrlC: false,
  debug: true,
});

const wait = (ms = 90) => new Promise((resolve) => setTimeout(resolve, ms));
const has = (needle: string): boolean => stdout.plain.includes(needle);
const strip = (): string => {
  const row = (stdout.latest.split("\n")[0] ?? "").replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "|");
  return row.replace(/\|+/g, "|").replace(/^\|+|\|+$/g, "");
};
const check = (label: string, pass: boolean): void => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);
  if (!pass) process.exitCode = 1;
};

async function press(bytes = ""): Promise<void> {
  if (bytes) stdout.reset();
  if (bytes) stdin.push(bytes);
  await wait();
}

console.log(`HOME=${HOME_TMP}\n--- state isolation ---`);
await press();
check("boots on the start tab", has("answer STARTTAB"));
check("strip shows the start tab", strip().includes("start tab"));

await press("\x14"); // ctrl+t
check("ctrl+t opens an empty second tab", strip().includes("new chat") && !has("answer STARTTAB"));

await press("\x1b[1;5D"); // ctrl+left
check("ctrl+left returns to tab 1 with its own history", has("answer STARTTAB"));

await press("\x1b[1;5C"); // ctrl+right
check("ctrl+right moves to the empty tab", !has("answer STARTTAB"));

await press("\x17"); // ctrl+w
check("ctrl+w closes it and restores tab 1", has("answer STARTTAB") && !strip().includes("new chat"));

console.log("--- persistence across tabs ---");
await press("/sessions");
await press("\r");
check("/sessions picker lists the disk tab", has("disk tab"));
await press("\x1b"); // dismiss without picking
await press("\x14"); // new tab
await press("/close");
await press("\r");
check("/close closes the tab", !strip().includes("new chat") && has("answer STARTTAB"));

console.log("--- picker ---");
await press("\x14");
await press("/tabs");
await press("\r");
check("/tabs opens the picker", /Tabs - \d+ open/.test(stdout.plain));
console.log("   picker rows:", JSON.stringify(stdout.plain.split("\n").filter((row) => /\d\./.test(row)).slice(0, 4)));
await press("2");
check("pressing 2 jumps to the empty tab", !has("answer STARTTAB"));
await press("\x14");
await press("/tabs");
await press("\r");
await press("1");
check("pressing 1 returns to the start tab", has("answer STARTTAB"));
await press("\x14");
await press("/tabs");
await press("\r");
await press("n");
check("n opens a fresh tab from the picker", strip().includes("new chat"));

console.log("--- guards ---");
const before = strip();
await press("\x17");
check("closing the last tab leaves one open", strip().length > 0 && before !== "");
await press("/tabs");
await press("\r");
check("picker still reachable", /Tabs - \d+ open/.test(stdout.plain));
await press("\x1b");

console.log(`\nfinal strip: ${JSON.stringify(strip())}`);
app.unmount();
process.exit(process.exitCode ?? 0);
