import { render } from "ink";
import { createElement } from "react";
import { configExists, loadConfig } from "../config/store.js";
import { initConfig } from "./configCmd.js";
import { App } from "../ui/App.js";
import { createSession } from "../session/history.js";
import type { Session } from "../session/types.js";

export async function startChat(session?: Session): Promise<void> {
  if (!configExists()) {
    console.log("No BajajBot config. Setup starts now.");
    await initConfig();
  }
  const config = loadConfig();
  await render(createElement(App, { config, session: session ?? createSession(config.defaultModel) })).waitUntilExit();
}
