import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appDir } from "../config/store.js";
import { sessionExists } from "./history.js";

/** Never restore more than this many tabs on boot - older ones stay in /sessions. */
export const MAX_OPEN_TABS = 8;

const tabsPath = () => join(appDir(), "tabs.json");

/** Open tab ids keyed by project directory, so each repo keeps its own set. */
type TabsFile = Record<string, string[]>;

function readTabs(): TabsFile {
  if (!existsSync(tabsPath())) return {};
  try {
    const parsed = JSON.parse(readFileSync(tabsPath(), "utf8")) as TabsFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOpenTabs(cwd: string, ids: string[]): void {
  const all = readTabs();
  all[cwd] = ids.slice(-MAX_OPEN_TABS);
  mkdirSync(appDir(), { recursive: true });
  writeFileSync(tabsPath(), `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Tab order to boot with: the tabs this project had open last time (newest
 * last), with any that no longer exist on disk dropped, plus the session the
 * app was started with. The boot session takes the last of the open slots.
 */
export function initialTabOrder(cwd: string, sessionId: string): string[] {
  const saved = readTabs()[cwd] ?? [];
  const restored = saved.filter((id) => id !== sessionId && sessionExists(id)).slice(-(MAX_OPEN_TABS - 1));
  return [...restored, sessionId];
}
