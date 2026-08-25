import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appDir } from "../config/store.js";
import type { Session } from "./types.js";

const sessionsDir = () => join(appDir(), "sessions");
const sessionPath = (id: string) => join(sessionsDir(), `${id}.json`);

export function createSession(model: string): Session {
  const now = new Date().toISOString();
  return { id: `chat-${Date.now()}`, createdAt: now, updatedAt: now, model, messages: [] };
}

export function saveSession(session: Session): void {
  mkdirSync(sessionsDir(), { recursive: true });
  writeFileSync(sessionPath(session.id), `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
}

export function loadSession(id: string): Session {
  if (!existsSync(sessionPath(id))) throw new Error(`Session not found: ${id}`);
  return JSON.parse(readFileSync(sessionPath(id), "utf8")) as Session;
}

export function listSessions(): { id: string; createdAt: string; title?: string; preview: string }[] {
  if (!existsSync(sessionsDir())) return [];
  return readdirSync(sessionsDir())
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(sessionsDir(), file), "utf8")) as Session)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      title: session.title,
      preview: session.messages.find((message) => message.role === "user")?.content.slice(0, 60) || "(empty chat)",
    }));
}

/** Every saved session, parsed in full (for the usage dashboard). */
export function loadAllSessions(): Session[] {
  if (!existsSync(sessionsDir())) return [];
  return readdirSync(sessionsDir())
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(sessionsDir(), file), "utf8")) as Session);
}
