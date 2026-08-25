import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { ToolArgs, ToolContext, ToolDef } from "./types.js";
import { expandHome } from "../util/paths.js";
import { unifiedDiff } from "../util/diff.js";

const MAX_READ = 60_000;
const MAX_LIST = 500;

function resolvePath(ctx: ToolContext, target: string | undefined): string {
  return resolve(ctx.cwd, expandHome(target && target.trim() ? target : "."));
}

function text(args: ToolArgs, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required argument: ${key}`);
  return value;
}

const MAX_UNDO_FILES = 500;
const MAX_UNDO_BYTES = 1_000_000;

function recordFile(ctx: ToolContext, full: string): void {
  if (!ctx.recordMutation) return;
  ctx.recordMutation({
    path: full,
    previousContent: existsSync(full) ? readFileSync(full, "utf8") : null,
    restorable: true,
  });
}

function snapshotTree(root: string): { files: Array<{ path: string; content: string }>; restorable: boolean } {
  const files: Array<{ path: string; content: string }> = [];
  let bytes = 0;
  let restorable = true;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        if (files.length >= MAX_UNDO_FILES || bytes > MAX_UNDO_BYTES) {
          restorable = false;
          return;
        }
        const content = readFileSync(full, "utf8");
        bytes += content.length;
        files.push({ path: full, content });
      }
    }
  };
  walk(root);
  return { files, restorable };
}

export const readFile: ToolDef = {
  name: "read_file",
  description: "Read a text file and return its contents.",
  risky: false,
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "File path — relative to the project, absolute, or ~/…" } },
    required: ["path"],
  },
  summary: (args) => args.path ?? "",
  execute: (args, ctx) => {
    const full = resolvePath(ctx, text(args, "path"));
    if (!existsSync(full)) throw new Error(`Not found: ${args.path}`);
    let content = readFileSync(full, "utf8");
    if (content.length > MAX_READ) content = `${content.slice(0, MAX_READ)}\n… truncated (${content.length} chars total)`;
    return content;
  },
};

export const listDir: ToolDef = {
  name: "list_dir",
  description: "List the entries of a directory (defaults to the project directory).",
  risky: false,
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Directory path — relative to the project, absolute, or ~/…" } },
  },
  summary: (args) => args.path || ".",
  execute: (args, ctx) => {
    const full = resolvePath(ctx, args.path);
    if (!existsSync(full)) throw new Error(`Not found: ${args.path ?? "."}`);
    const entries = readdirSync(full, { withFileTypes: true })
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, MAX_LIST)
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
    return entries.length ? entries.join("\n") : "(empty directory)";
  },
};

export const writeFile: ToolDef = {
  name: "write_file",
  description: "Create or overwrite a file with the given content. Parent directories are created as needed.",
  risky: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path — relative to the project, absolute, or ~/…" },
      content: { type: "string", description: "Full file content to write" },
    },
    required: ["path", "content"],
  },
  summary: (args) => `${args.path} (${(args.content ?? "").split("\n").length} lines)`,
  detail: (args, ctx) => {
    try {
      const full = resolvePath(ctx, args.path);
      const existing = statSync(full, { throwIfNoEntry: false });
      const oldText = existing?.isFile() ? readFileSync(full, "utf8") : "";
      const content = typeof args.content === "string" ? args.content : "";
      return unifiedDiff(oldText, content) || "(no changes)";
    } catch {
      return "(diff preview unavailable)";
    }
  },
  execute: (args, ctx) => {
    const full = resolvePath(ctx, text(args, "path"));
    const content = text(args, "content");
    recordFile(ctx, full);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    return `Wrote ${Buffer.byteLength(content)} bytes to ${args.path}`;
  },
};

export const editFile: ToolDef = {
  name: "edit_file",
  description: "Replace an exact snippet inside a file. The find string must appear exactly once.",
  risky: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path — relative to the project, absolute, or ~/…" },
      find: { type: "string", description: "Exact existing text to replace" },
      replace: { type: "string", description: "Replacement text" },
    },
    required: ["path", "find", "replace"],
  },
  summary: (args) => `${args.path}: "${String(args.find ?? "").slice(0, 40)}" → "${String(args.replace ?? "").slice(0, 40)}"`,
  detail: (args, ctx) => {
    try {
      const full = resolvePath(ctx, text(args, "path"));
      const original = readFileSync(full, "utf8");
      const find = text(args, "find");
      const replace = typeof args.replace === "string" ? args.replace : "";
      return unifiedDiff(original, original.split(find).join(replace)) || "(no changes)";
    } catch {
      return "(diff preview unavailable — the find string may be missing or ambiguous)";
    }
  },
  execute: (args, ctx) => {
    const full = resolvePath(ctx, text(args, "path"));
    if (!existsSync(full)) throw new Error(`Not found: ${args.path}`);
    const original = readFileSync(full, "utf8");
    const find = text(args, "find");
    const occurrences = original.split(find).length - 1;
    if (occurrences === 0) throw new Error("find string not present in file");
    if (occurrences > 1) throw new Error(`find string appears ${occurrences} times; add surrounding context to make it unique`);
    recordFile(ctx, full);
    writeFileSync(full, original.replace(find, () => (typeof args.replace === "string" ? args.replace : "")));
    return `Edited ${basename(String(args.path))}`;
  },
};

export const deletePath: ToolDef = {
  name: "delete_path",
  description: "Permanently delete a file or directory (recursive).",
  risky: true,
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Path — relative to the project, absolute, or ~/…" } },
    required: ["path"],
  },
  summary: (args) => String(args.path ?? ""),
  execute: (args, ctx) => {
    const full = resolvePath(ctx, text(args, "path"));
    if (!existsSync(full)) throw new Error(`Not found: ${args.path}`);
    if (ctx.recordMutation) {
      const stats = statSync(full);
      if (stats.isDirectory()) {
        const { files, restorable } = snapshotTree(full);
        ctx.recordMutation({ path: full, previousContent: null, previousFiles: files, restorable });
      } else {
        recordFile(ctx, full);
      }
    }
    rmSync(full, { recursive: true });
    return `Deleted ${args.path}`;
  },
};
