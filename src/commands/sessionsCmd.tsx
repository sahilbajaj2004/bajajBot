import type { Command } from "commander";
import { render } from "ink";
import { createElement } from "react";
import { configExists } from "../config/store.js";
import { listSessions, loadSession } from "../session/history.js";
import { SessionPicker } from "../ui/SessionPicker.js";
import { startChat } from "./chat.js";

export function registerSessionsCommand(program: Command): void {
  program.command("sessions").description("Choose a saved session").action(async () => {
    if (!configExists()) return startChat();
    const sessions = listSessions();
    if (!sessions.length) {
      console.log("No saved sessions.");
      return;
    }
    const id = await pickSession(sessions);
    if (id) await startChat(loadSession(id));
  });
}

function pickSession(sessions: ReturnType<typeof listSessions>): Promise<string | undefined> {
  return new Promise((resolve) => {
    let app: ReturnType<typeof render>;
    app = render(createElement(SessionPicker, {
      sessions,
      onSelect: (id) => {
        app.unmount();
        resolve(id);
      },
    }));
  });
}
