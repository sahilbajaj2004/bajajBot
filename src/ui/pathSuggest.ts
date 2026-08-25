import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { expandHome } from "../util/paths.js";
import { SKIP_DIRS } from "../tools/search.js";

export const MAX_PATH_SUGGESTIONS = 20;
const CACHE_LIMIT = 150;
const cache = new Map<string, string[]>();

/**
 * Relative project paths matching a partial @fragment like "", "sr" or
 * "src/ui/Ap". Directories come back with a trailing slash so they can be
 * tab-completed step by step. Hidden entries and build/vendor dirs skipped.
 * Results are memoized per fragment for the life of the process.
 */
export function listPathSuggestions(fragment: string, cwd: string): string[] {
  const key = `${cwd}::${fragment}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result = computeSuggestions(fragment, cwd);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);
  return result;
}

function computeSuggestions(fragment: string, cwd: string): string[] {
  const query = fragment.replace(/\\/g, "/");
  const splitAt = query.lastIndexOf("/");
  const dirPart = splitAt === -1 ? "" : query.slice(0, splitAt);
  const leaf = query.slice(splitAt + 1).toLowerCase();
  let base = cwd;
  if (dirPart) {
    base = resolve(cwd, expandHome(dirPart));
    try {
      if (!statSync(base).isDirectory()) return [];
    } catch {
      return [];
    }
  }

  const out: string[] = [];

  const walk = (dir: string, relBase: string): void => {
    if (out.length >= MAX_PATH_SUGGESTIONS) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= MAX_PATH_SUGGESTIONS) return;
      if (entry.name.startsWith(".") && entry.name !== "..") continue;
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (rel.toLowerCase().startsWith(leaf)) out.push(`${rel}/`);
        walk(resolve(dir, entry.name), rel);
      } else if (entry.isFile() && rel.toLowerCase().startsWith(leaf)) {
        out.push(rel);
      }
    }
  };

  walk(base, "");
  return out;
}
