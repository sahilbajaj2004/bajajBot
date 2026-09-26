import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { SKIP_DIRS } from "./search.js";

/** Hard cap on the injected map so it never bloats the context budget. */
export const MAP_MAX_CHARS = 2500;
const MAX_TREE_DIRS = 40;
const MAX_FILES_PER_DIR = 6;

interface DirSummary {
  rel: string;
  files: string[];
  subdirs: string[];
}

function scan(root: string): DirSummary[] {
  const results: DirSummary[] = [];
  const seen = new Set<string>();

  const walk = (dir: string, depth: number): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

    const files: string[] = [];
    const subdirs: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        subdirs.push(entry.name);
      } else if (entry.isFile()) {
        if (entry.name.startsWith(".")) continue;
        files.push(entry.name);
      }
    }

    const rel = relative(root, dir) || ".";
    if (files.length || subdirs.length) results.push({ rel, files, subdirs });
    if (results.length >= MAX_TREE_DIRS) return;
    if (depth >= 2) return;

    for (const name of subdirs) {
      const full = join(dir, name);
      if (seen.has(full) || seen.size >= MAX_TREE_DIRS) continue;
      seen.add(full);
      walk(full, depth + 1);
    }
  };

  walk(root, 0);
  return results;
}

/** Count file extensions within a dir, e.g. [["ts",12],["css",3]]. */
function extensionCounts(files: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const dot = file.lastIndexOf(".");
    const ext = dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
    if (ext && ext.length <= 8) counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** A compact, bounded project map for the system prompt; "" when trivial. */
export function repositoryMap(cwd: string): string {
  const dirs = scan(cwd);
  if (!dirs.length) return "";

  const lines: string[] = [];
  const budget = MAP_MAX_CHARS;
  let used = 0;
  const emit = (line: string): boolean => {
    if (used + line.length + 1 > budget) return false;
    lines.push(line);
    used += line.length + 1;
    return true;
  };

  for (const dir of dirs) {
    const indent = "  ".repeat(dir.rel === "." ? 0 : dir.rel.split("/").length);
    const label = dir.rel === "." ? "." : dir.rel;
    const total = dir.files.length;
    const exts = extensionCounts(dir.files)
      .slice(0, 3)
      .map(([ext, count]) => `${ext}×${count}`)
      .join(", ");
    if (!emit(`${indent}${label}/  (${total} file${total === 1 ? "" : "s"}${exts ? ` · ${exts}` : ""})`)) break;
    for (const file of dir.files.slice(0, MAX_FILES_PER_DIR)) {
      if (!emit(`${indent}  ${file}`)) break;
    }
    if (dir.files.length > MAX_FILES_PER_DIR && !emit(`${indent}  … +${dir.files.length - MAX_FILES_PER_DIR} more`)) break;
  }

  return lines.length ? lines.join("\n") : "";
}

/** Short prompt block; "" when the map is empty. */
export function repoMapBlock(cwd: string): string {
  const map = repositoryMap(cwd);
  if (!map) return "";
  return `\n\nHere is a map of the project so you can navigate it without probing blindly (directories first, then notable files; "ext×n" = file counts by extension):\n${map}`;
}