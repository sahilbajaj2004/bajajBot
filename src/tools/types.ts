import type { PlanItem } from "../session/types.js";

/** Snapshot of a path's state before a tool mutated it, enough to undo. */
export interface FileMutation {
  /** Absolute path that was mutated. */
  path: string;
  /** File content before the change, or null when the file did not exist. */
  previousContent: string | null;
  /** For deleted directories: the files (and contents) that used to live inside. */
  previousFiles?: Array<{ path: string; content: string }>;
  /** false when a deleted directory was too large to snapshot completely. */
  restorable: boolean;
}

export interface ToolContext {
  cwd: string;
  confirm: (title: string, detail: string) => Promise<boolean>;
  /** Called by mutating tools with a snapshot of the pre-change state. */
  recordMutation?: (mutation: FileMutation) => void;
  /** Called when the agent updates its visible task plan. */
  setPlan?: (items: PlanItem[]) => void;
}

export type ToolArgs = Record<string, string | undefined>;

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risky: boolean;
  summary: (args: ToolArgs) => string;
  /** Rich confirmation detail (e.g. a diff); falls back to the args dump. */
  detail?: (args: ToolArgs, ctx: ToolContext) => string;
  execute: (args: ToolArgs, ctx: ToolContext) => Promise<string> | string;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
