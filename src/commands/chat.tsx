import { render } from "ink";
import { createElement } from "react";
import { configExists, loadConfig } from "../config/store.js";
import { initConfig } from "./configCmd.js";
import { App } from "../ui/App.js";
import { createMouseStdin } from "../ui/mouse.js";
import { printGoodbye, type ExitSummary } from "../ui/goodbye.js";
import { setTerminalTitle } from "../ui/title.js";
import { createSession } from "../session/history.js";
import { checkForUpdate } from "../util/updateCheck.js";
import { applyTheme } from "../ui/theme.js";
import type { Session } from "../session/types.js";

export async function startChat(session?: Session, initialPrompt?: string, version?: string): Promise<void> {
  setTerminalTitle("BajajBot");
  if (!configExists()) {
    const created = await initConfig();
    if (!created) return;
  }
  const config = loadConfig();
  applyTheme(config.theme);
  if (version) {
    // A passive hint only: /update is what actually installs, and it reports
    // progress. Writing to the console here would land outside Ink's frame.
    void checkForUpdate(version).then((latest) => {
      if (latest) console.log(`⬆ bajajbot v${latest} available - run /update to install it`);
    });
  }
  const mouse = createMouseStdin(process.stdin as NodeJS.ReadStream & { isTTY?: boolean });
  // 1003 = report motion even with no button held, so the tab strip can show
  // its close button on hover. 1006 = SGR encoding.
  if (process.stdout.isTTY) process.stdout.write("\x1b[?1003h\x1b[?1006h");
  try {
    const result = (await render(
      createElement(App, {
        config,
        session: session ?? createSession(config.defaultModel),
        mouse,
        initialPrompt,
        version,
      }),
      { stdin: mouse.stream as unknown as NodeJS.ReadStream, exitOnCtrlC: false },
    ).waitUntilExit()) as string | ExitSummary | undefined;
    if (typeof result === "string") {
      console.log(result);
    } else if (result && typeof result === "object") {
      printGoodbye(result);
    }
  } finally {
    if (process.stdout.isTTY) process.stdout.write("\x1b[?1003l\x1b[?1002l\x1b[?1006l\x1b[?1000l");
    mouse.cleanup();
  }
}
