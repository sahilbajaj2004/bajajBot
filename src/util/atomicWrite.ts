import { chmodSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Write a file so a reader never sees a half-written one.
 *
 * A plain writeFileSync truncates the target first, so a crash, a SIGKILL, or a
 * full disk mid-write leaves a partial file behind. For a chat transcript or a
 * config holding an API key that is unrecoverable data loss, not a glitch: the
 * next read is a JSON parse error and the history is gone.
 *
 * Write to a sibling temp file, then rename over the target. rename is atomic
 * within a filesystem, so the target is either the old file or the new one.
 */
export function writeFileAtomic(path: string, contents: string, mode = 0o600): void {
  // Same directory, so the rename stays within one filesystem. A pid suffix
  // keeps two concurrent writers from sharing a temp name.
  const temp = join(path === "" ? "." : dirnameOf(path), `.${basenameOf(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(temp, contents, { mode });
    // writeFileSync only applies `mode` when it creates the file, and umask can
    // clear bits; set them explicitly so the window before the rename is tight.
    chmodSync(temp, mode);
    renameSync(temp, path);
  } catch (cause) {
    try {
      unlinkSync(temp);
    } catch {
      // best-effort cleanup
    }
    throw cause;
  }
}

function dirnameOf(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? path : path.slice(0, index);
}

function basenameOf(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index < 0 ? path : path.slice(index + 1);
}
