import { render } from "ink";
import { createElement } from "react";
import { App } from "../src/ui/App.js";
import { TabBar, type TabView } from "../src/ui/TabBar.js";
import { FrameStdin, FrameStdout } from "./frame-stdout.js";
import type { Config } from "../src/config/types.js";
import type { Session } from "../src/session/types.js";
import { HOME_TMP } from "./harness.js";

const now = new Date().toISOString();
const session: Session = {
  id: "chat-tabsmoke",
  createdAt: now,
  updatedAt: now,
  model: "mock/small",
  title: "Latest OpenCode updates over two hundred chars of title text that must be clipped",
  messages: [
    { role: "user", content: "what is new in opencode", timestamp: now },
    { role: "assistant", content: "here is the summary", timestamp: now },
  ],
};

const config: Config = {
  provider: "custom",
  apiKey: "k",
  baseUrl: "http://127.0.0.1:9/v1",
  defaultModel: "mock/small",
};

function appFrame(columns: number, rows: number): FrameStdout {
  const stdout = new FrameStdout(columns, rows);
  const stdin = new FrameStdin();
  const app = render(createElement(App, { config, session }), {
    stdout: stdout as never,
    stdin: stdin as never,
    exitOnCtrlC: false,
    debug: true,
  });
  app.unmount();
  return stdout;
}

const full = appFrame(100, 24);
const body = full.lines.filter((_, index) => index < full.lines.length - 1);
console.log(`=== app frame: ${body.length} rows (terminal 24) ===`);
body.forEach((row, index) => console.log(String(index).padStart(2), JSON.stringify(row)));
console.log("=== tab row on top:", body[0]?.includes("Latest OpenCode updates"), "===");
console.log("=== chat still visible:", /what is new in opencode/.test(full.plain), "===");

const tabs: TabView[] = [
  { id: "a", title: "Latest OpenCode updates over two hundred chars of title", running: true },
  { id: "b", title: "refactor the session store", running: false },
  { id: "c", title: "fix flaky tests", running: false },
];
for (const columns of [40, 60, 80, 120]) {
  const stdout = new FrameStdout(columns, 10);
  const view = render(createElement(TabBar, { tabs, activeId: "a", columns, frame: "⠋" }), { stdout, debug: true });
  view.unmount();
  const row = stdout.lines[0] ?? "";
  console.log(`=== TabBar @${columns} (len ${row.length}) ===`, JSON.stringify(row));
}

console.log("=== HOME:", HOME_TMP, "===");
process.exit(0);
