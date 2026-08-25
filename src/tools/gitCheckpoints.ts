import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 15_000;
const REF = "refs/bajajbot/checkpoints";

/** One checkpoint at a time; a still-running snapshot skips the next turn. */
let inFlight = false;

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
 * stash and history are untouched. Async so the chat UI never blocks on git;
 * returns the new sha or null when skipped (not a repo, git failed, or a
 * previous snapshot is still running).
 */
export async function createSnapshot(cwd: string, label: string): Promise<string | null> {
  if (inFlight || !isGitRepo(cwd)) return null;
  inFlight = true;
  let indexFile: string | null = null;
  try {
    const run = async (args: string[], env?: NodeJS.ProcessEnv): Promise<string> => {
      const { stdout } = await execFileAsync("git", args, {
        cwd,
        env: { ...process.env, ...env },
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
      });
      return stdout.trim();
    };
    const topLevel = await run(["rev-parse", "--show-toplevel"]);
    indexFile = mkdtempSync(join(tmpdir(), "bajajbot-idx-"));
    const indexEnv = { GIT_INDEX_FILE: join(indexFile, "index") };
    await run(["add", "-A", "."], indexEnv).catch(() => undefined);
    const tree = await run(["write-tree"], indexEnv);
    let parent: string[] = [];
    try {
      parent = ["-p", await run(["rev-parse", "--verify", REF])];
    } catch {
      // first checkpoint has no parent
    }
    const sha = await run(["commit-tree", tree, ...parent, "-m", `bajajbot: ${label}`]);
    await run(["update-ref", REF, sha]);
    return sha;
  } catch {
    return null;
  } finally {
    if (indexFile) rmSync(indexFile, { recursive: true, force: true });
    inFlight = false;
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
