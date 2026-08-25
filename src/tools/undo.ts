import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { FileMutation } from "./types.js";

/**
 * Undo mutations in reverse order (last change first), so
 * write-then-delete chains restore the original file correctly.
 * Returns the number of paths restored; non-restorable deletions are skipped.
 */
export function restoreMutations(mutations: FileMutation[]): { restored: number; skipped: number } {
  let restored = 0;
  let skipped = 0;
  for (const mutation of [...mutations].reverse()) {
    try {
      if (mutation.previousFiles) {
        if (!mutation.restorable) {
          skipped += 1;
          continue;
        }
        rmSync(mutation.path, { recursive: true, force: true });
        mkdirSync(mutation.path, { recursive: true });
        for (const file of mutation.previousFiles) {
          mkdirSync(dirname(file.path), { recursive: true });
          writeFileSync(file.path, file.content, "utf8");
        }
        restored += 1;
      } else if (mutation.previousContent === null) {
        rmSync(mutation.path, { force: true });
        restored += 1;
      } else {
        mkdirSync(dirname(mutation.path), { recursive: true });
        writeFileSync(mutation.path, mutation.previousContent, "utf8");
        restored += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return { restored, skipped };
}
