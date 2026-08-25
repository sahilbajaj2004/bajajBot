import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { APP_DIR_NAME } from "../config/constants.js";
import type { ToolArgs, ToolDef } from "./types.js";

const MAX_FACTS = 200;
const MAX_FACT_CHARS = 300;
/** Characters of memory injected into the system prompt. */
const PROMPT_BUDGET = 1500;

export function memoryPath(options: { home?: string } = {}): string {
  return join(options.home ?? homedir(), APP_DIR_NAME, "memory.md");
}

/** Saved facts, oldest first. */
export function readMemory(options: { home?: string } = {}): string[] {
  try {
    return readFileSync(memoryPath(options), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeMemory(facts: string[], options: { home?: string } = {}): void {
  const path = memoryPath(options);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, facts.map((fact) => `- ${fact}`).join("\n") + (facts.length ? "\n" : ""));
}

/** Append a fact; exact duplicates (case-insensitive) are ignored. */
export function remember(fact: string, options: { home?: string } = {}): { saved: boolean; duplicate: boolean } {
  const clean = fact.replace(/\s+/g, " ").trim().slice(0, MAX_FACT_CHARS);
  if (!clean) return { saved: false, duplicate: false };
  const facts = readMemory(options);
  if (facts.some((entry) => entry.toLowerCase() === clean.toLowerCase())) {
    return { saved: false, duplicate: true };
  }
  const next = [...facts, clean].slice(-MAX_FACTS);
  writeMemory(next, options);
  return { saved: true, duplicate: false };
}

/** Remove every fact containing the fragment (case-insensitive). */
export function forget(fragment: string, options: { home?: string } = {}): number {
  const needle = fragment.replace(/\s+/g, " ").trim().toLowerCase();
  if (!needle) return 0;
  const facts = readMemory(options);
  const kept = facts.filter((fact) => !fact.toLowerCase().includes(needle));
  if (kept.length === facts.length) return 0;
  writeMemory(kept, options);
  return facts.length - kept.length;
}

/** Memory block for the system prompt; empty string when nothing stored. */
export function memoryPromptBlock(options: { home?: string } = {}): string {
  const facts = readMemory(options);
  if (!facts.length) return "";
  let used = 0;
  const recent: string[] = [];
  for (let index = facts.length - 1; index >= 0; index--) {
    const line = `- ${facts[index]}`;
    if (used + line.length > PROMPT_BUDGET) break;
    used += line.length;
    recent.unshift(line);
  }
  return `\nPersistent memory from previous sessions (newest last):\n${recent.join("\n")}`;
}

export const memoryTool: ToolDef = {
  name: "memory",
  description:
    "Persist durable facts across sessions — user preferences, project conventions, decisions, environment quirks. Not for secrets, tokens, or transient task state.",
  risky: false,
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["save", "list", "forget"], description: "What to do with memory" },
      fact: { type: "string", description: "save: one-sentence fact. forget: substring matching facts to remove" },
    },
    required: ["action"],
  },
  summary: (args: ToolArgs) => `${String(args.action ?? "list")} memory${args.fact ? `: ${String(args.fact).slice(0, 60)}` : ""}`,
  execute: (args: ToolArgs) => {
    const action = String(args.action ?? "list");
    if (action === "save") {
      const result = remember(String(args.fact ?? ""));
      if (!result.saved && !result.duplicate) return "Error: nothing to save (empty fact).";
      return result.duplicate ? "Already in memory — unchanged." : "Saved to memory.";
    }
    if (action === "forget") {
      const removed = forget(String(args.fact ?? ""));
      return removed ? `Removed ${removed} memory entr${removed === 1 ? "y" : "ies"}.` : "No matching memory entries.";
    }
    const facts = readMemory();
    return facts.length ? facts.map((fact) => `- ${fact}`).join("\n") : "(memory is empty)";
  },
};

export function memoryFileExists(options: { home?: string } = {}): boolean {
  return existsSync(memoryPath(options));
}
