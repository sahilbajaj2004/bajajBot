import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ToolArgs, ToolContext, ToolDef } from "./types.js";

const MAX_READ = 60_000;
const MAX_LIST = 500;

function safePath(ctx: ToolContext, target: string | undefined): string {
  const root = resolve(ctx.cwd);
  const full = resolve(root, target && target.trim() ? target : ".");
  const rel = relative(root, full);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Path escapes the project directory.");
  return full;
}

function text(args: ToolArgs, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required argument: ${key}`);
  return value;
}

export const readFile: ToolDef = {
  name: "read_file",
  description: "Read a text file and return its contents.",
  risky: false,
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "File path relative to the project directory" } },
    required: ["path"],
  },
  summary: (args) => args.path ?? "",
  execute: (args, ctx) => {
    const full = safePath(ctx, text(args, "path"));
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
    properties: { path: { type: "string", description: "Directory path relative to the project directory" } },
  },
  summary: (args) => args.path || ".",
  execute: (args, ctx) => {
    const full = safePath(ctx, args.path);
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
      path: { type: "string", description: "File path relative to the project directory" },
      content: { type: "string", description: "Full file content to write" },
    },
    required: ["path", "content"],
  },
  summary: (args) => `${args.path} (${(args.content ?? "").split("\n").length} lines)`,
  execute: (args, ctx) => {
    const full = safePath(ctx, text(args, "path"));
    const content = text(args, "content");
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
      path: { type: "string", description: "File path relative to the project directory" },
      find: { type: "string", description: "Exact existing text to replace" },
      replace: { type: "string", description: "Replacement text" },
    },
    required: ["path", "find", "replace"],
  },
  summary: (args) => `${args.path}: "${String(args.find ?? "").slice(0, 40)}" → "${String(args.replace ?? "").slice(0, 40)}"`,
  execute: (args, ctx) => {
    const full = safePath(ctx, text(args, "path"));
    if (!existsSync(full)) throw new Error(`Not found: ${args.path}`);
    const original = readFileSync(full, "utf8");
    const find = text(args, "find");
    const occurrences = original.split(find).length - 1;
    if (occurrences === 0) throw new Error("find string not present in file");
    if (occurrences > 1) throw new Error(`find string appears ${occurrences} times; add surrounding context to make it unique`);
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
    properties: { path: { type: "string", description: "Path relative to the project directory" } },
    required: ["path"],
  },
  summary: (args) => String(args.path ?? ""),
  execute: (args, ctx) => {
    const full = safePath(ctx, text(args, "path"));
    if (!existsSync(full)) throw new Error(`Not found: ${args.path}`);
    rmSync(full, { recursive: true });
    return `Deleted ${args.path}`;
  },
};
