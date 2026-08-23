import { render } from "ink";
import { createElement } from "react";
import { configExists, loadConfig } from "../config/store.js";
import { initConfig } from "./configCmd.js";
import { App } from "../ui/App.js";
import { createMouseStdin } from "../ui/mouse.js";
import { printGoodbye, type ExitSummary } from "../ui/goodbye.js";
import { createSession } from "../session/history.js";
import type { Session } from "../session/types.js";

export async function startChat(session?: Session): Promise<void> {
  if (!configExists()) {
    const created = await initConfig();
    if (!created) return;
  }
  const config = loadConfig();
  const mouse = createMouseStdin(process.stdin as NodeJS.ReadStream & { isTTY?: boolean });
  if (process.stdout.isTTY) process.stdout.write("\x1b[?1000h\x1b[?1006h");
  try {
    const result = (await render(
      createElement(App, { config, session: session ?? createSession(config.defaultModel) }),
      { stdin: mouse.stream as unknown as NodeJS.ReadStream, exitOnCtrlC: false },
    ).waitUntilExit()) as string | ExitSummary | undefined;
    if (typeof result === "string") {
      console.log(result);
    } else if (result && typeof result === "object") {
      printGoodbye(result);
    }
  } finally {
    if (process.stdout.isTTY) process.stdout.write("\x1b[?1006l\x1b[?1000l");
    mouse.cleanup();
  }
}
