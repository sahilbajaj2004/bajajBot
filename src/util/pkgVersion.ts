import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

const PACKAGE_NAME = "bajajbot";
/** node_modules/<pkg>/dist/bin -> a few levels up is plenty. */
const MAX_LEVELS = 6;

function readVersion(dir: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
    };
    if (pkg.name !== PACKAGE_NAME) return null;
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * Read our own version from the nearest package.json above `entry`.
 *
 * `entry` is normally process.argv[1], which for an installed package is npm's
 * `.bin` symlink - walking up from there never reaches the package, so the
 * real path is tried first. Without this, `bajajbot --version` prints
 * "unknown" and every release looks like an update.
 */
export function packageVersion(entry: string = process.argv[1] ?? "."): string {
  const starts: string[] = [];
  try {
    starts.push(realpathSync(entry));
  } catch {
    // A relative or missing entry is fine - fall back to it as given.
  }
  starts.push(entry);

  for (const start of starts) {
    let dir = dirname(start);
    for (let level = 0; level < MAX_LEVELS; level += 1) {
      const version = readVersion(dir);
      if (version) return version;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return "unknown";
}
