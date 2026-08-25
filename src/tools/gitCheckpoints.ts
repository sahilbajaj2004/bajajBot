import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REF = "refs/bajajbot/checkpoints";

export interface Snapshot {
  sha: string;
  label: string;
  time: string;
}

function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } }).trim();
}

export function isGitRepo(cwd: string): boolean {
  try {
    git(cwd, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshot the whole working tree into a hidden commit on
 * refs/bajajbot/checkpoints using plumbing only — the user's index, branch,
 * stash and history are untouched. Returns the new sha or null when this is
 * not a repo or git failed.
 */
export function createSnapshot(cwd: string, label: string): string | null {
  if (!isGitRepo(cwd)) return null;
  let indexFile: string | null = null;
  try {
    const topLevel = git(cwd, ["rev-parse", "--show-toplevel"]);
    indexFile = mkdtempSync(join(tmpdir(), "bajajbot-idx-"));
    const indexEnv = { GIT_INDEX_FILE: join(indexFile, "index") };
    git(topLevel, ["add", "-A", "."], indexEnv);
    const tree = git(topLevel, ["write-tree"], indexEnv);
    let parent: string[] = [];
    try {
      parent = ["-p", git(topLevel, ["rev-parse", "--verify", REF])];
    } catch {
      // first checkpoint has no parent
    }
    const sha = git(topLevel, ["commit-tree", tree, ...parent, "-m", `bajajbot: ${label}`]);
    git(topLevel, ["update-ref", REF, sha]);
    return sha;
  } catch {
    return null;
  } finally {
    if (indexFile) rmSync(indexFile, { recursive: true, force: true });
  }
}

export function listSnapshots(cwd: string, limit = 12): Snapshot[] {
  try {
    // rev-list --format emits: "commit <sha>\n<label>\x1f<time>\n" per commit
    const output = git(cwd, ["rev-list", REF, "--max-count", String(limit), "--format=%s%x1f%ci"]);
    const snapshots: Snapshot[] = [];
    for (const line of output.split("\n")) {
      if (!line) continue;
      if (line.startsWith("commit ")) {
        snapshots.push({ sha: line.slice(7).trim(), label: "(checkpoint)", time: "" });
      } else if (snapshots.length) {
        const [label = "", time = ""] = line.split("\x1f");
        const current = snapshots[snapshots.length - 1];
        if (label) current.label = label;
        current.time = time;
      }
    }
    return snapshots;
  } catch {
    return [];
  }
}

/**
 * Restore every file that existed at the snapshot into the working tree.
 * Brand-new files created after the snapshot are intentionally left alone.
 */
export function restoreSnapshot(cwd: string, sha: string): boolean {
  try {
    git(cwd, ["checkout", sha, "--", "."]);
    return true;
  } catch {
    return false;
  }
}
