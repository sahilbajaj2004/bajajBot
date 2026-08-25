import { readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { ToolArgs, ToolContext, ToolDef } from "./types.js";
import { expandHome } from "../util/paths.js";

const MAX_MATCHES = 200;
const MAX_OUTPUT = 60_000;
const MAX_FILE_BYTES = 512 * 1024;

export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".next",
  ".cache",
  ".venv",
  "venv",
]);

function globToRegExp(glob: string): RegExp {
  const source = glob
    .trim()
    .split(/[*,]/)
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, "i");
}

function matchesGlob(name: string, globs: RegExp[]): boolean {
  return !globs.length || globs.some((glob) => glob.test(name));
}

export const searchFiles: ToolDef = {
  name: "search_files",
  description:
    "Search file contents across a directory tree with a regular expression (ripgrep-style). Returns matching lines as file:line: text. Skips binaries, node_modules, .git, dist and similar. Patterns without uppercase letters match case-insensitively.",
  risky: false,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression matched against every line, e.g. \"TODO|FIXME\" or \"class \\w+\"" },
      path: { type: "string", description: "Directory to search — relative to the project, absolute, or ~/…; defaults to the project directory" },
      glob: { type: "string", description: 'Only search filenames matching this filter, e.g. "*.ts" or "*.js,*.jsx"' },
    },
    required: ["pattern"],
  },
  summary: (args) => `"${String(args.pattern ?? "").slice(0, 60)}"${args.path ? ` in ${args.path}` : ""}`,
  execute: (args, ctx) => {
    const pattern = String(args.pattern ?? "").trim();
    if (!pattern) throw new Error("Missing required argument: pattern");
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, pattern === pattern.toLowerCase() ? "i" : "");
    } catch {
      throw new Error(`Invalid regular expression: ${pattern}`);
    }
    const globs = typeof args.glob === "string" && args.glob.trim() ? args.glob.split(",").map(globToRegExp) : [];

    const root = resolve(ctx.cwd, expandHome(typeof args.path === "string" && args.path.trim() ? args.path : "."));
    if (!statSync(root, { throwIfNoEntry: false })) throw new Error(`Not found: ${args.path ?? "."}`);

    const lines: string[] = [];
    let truncated = false;
    let searched = 0;

    const rel = (full: string): string => {
      const relPath = relative(ctx.cwd, full);
      return relPath && !relPath.startsWith("..") && !isAbsolute(relPath) ? relPath : full;
    };

    const walk = (dir: string): void => {
      if (truncated) return;
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (truncated) return;
        const full = resolve(dir, entry.name);
        if (entry.isFile()) {
          if (!matchesGlob(entry.name, globs)) continue;
          let content: string;
          try {
            if (statSync(full).size > MAX_FILE_BYTES) continue;
            const buffer = readFileSync(full);
            if (buffer.includes(0)) continue;
            content = buffer.toString("utf8");
          } catch {
            continue;
          }
          searched += 1;
          const prefix = `${rel(full)}:`;
          content.split("\n").forEach((line, index) => {
            if (truncated || !regex.test(line)) return;
            lines.push(`${prefix}${index + 1}: ${line.trim()}`);
            if (lines.length >= MAX_MATCHES || lines.join("\n").length > MAX_OUTPUT) truncated = true;
          });
        } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          walk(full);
        }
      }
    };

    walk(root);

    if (!lines.length) return `No matches for "${pattern}" (${searched} file${searched === 1 ? "" : "s"} searched).`;
    const note = truncated ? `\n… stopped at ${MAX_MATCHES} matches (${searched}+ files searched); narrow the pattern or use glob.` : "";
    return `${lines.join("\n")}${note}`;
  },
};
