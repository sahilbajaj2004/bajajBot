import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { APP_DIR_NAME } from "../config/constants.js";

/** Total characters of injected instructions before truncation. */
const MAX_CHARS = 8000;

export const INSTRUCTIONS_FILE = "BAJAJBOT.md";

export interface LoadedInstructions {
  /** Path of the project-level file, when found. */
  projectPath?: string;
  /** Path of the global (~/.bajajbot) file, when found. */
  globalPath?: string;
  /** Combined block for the system prompt; empty when nothing exists. */
  text: string;
}

function readIfPresent(path: string, budget: number): { content: string; truncated: boolean } | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (!raw) return null;
    return raw.length <= budget ? { content: raw, truncated: false } : { content: `${raw.slice(0, budget)}\n… (truncated)`, truncated: true };
  } catch {
    return null;
  }
}

/**
 * Project instructions the user keeps next to their code. First match wins:
 * `BAJAJBOT.md` in the working directory, then `.bajajbot/BAJAJBOT.md`.
 * The global `~/.bajajbot/BAJAJBOT.md` (if any) is prepended. Re-read on
 * every call so edits apply to the next message without a restart.
 */
export function loadInstructions(cwd: string, options: { home?: string } = {}): LoadedInstructions {
  const home = options.home ?? homedir();
  const projectPath =
    [join(cwd, INSTRUCTIONS_FILE), join(cwd, `.${APP_DIR_NAME}`, INSTRUCTIONS_FILE)].find((path) => existsSync(path)) ??
    undefined;
  const globalPath = join(home, APP_DIR_NAME, INSTRUCTIONS_FILE);

  const sections: string[] = [];
  let budget = MAX_CHARS;

  const global = readIfPresent(globalPath, budget);
  if (global) {
    sections.push(`<${INSTRUCTIONS_FILE} (global)>\n${global.content}\n</${INSTRUCTIONS_FILE}>`);
    budget -= global.content.length;
  }
  if (projectPath) {
    const project = readIfPresent(projectPath, Math.max(budget, 500));
    if (project) {
      sections.push(`<${INSTRUCTIONS_FILE} (project)>\n${project.content}\n</${INSTRUCTIONS_FILE}>`);
    }
  }

  return { projectPath, globalPath: existsSync(globalPath) ? globalPath : undefined, text: sections.join("\n\n") };
}

/** Full system prompt block for the loaded instructions ("" when none). */
export function instructionsBlock(cwd: string, options: { home?: string } = {}): string {
  const { text } = loadInstructions(cwd, options);
  if (!text) return "";
  return `\n\nThe user keeps standing instructions for this project in ${INSTRUCTIONS_FILE}. Follow them:\n${text}`;
}
