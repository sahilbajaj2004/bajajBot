import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createSnapshot, isGitRepo, listSnapshots, restoreSnapshot } from "../src/tools/gitCheckpoints.js";

const root = mkdtempSync(join(tmpdir(), "bajajbot-git-"));
after(() => rmSync(root, { recursive: true, force: true }));

const run = (args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

run(["init"]);
run(["config", "user.email", "test@test"]);
run(["config", "user.name", "test"]);

function worktreeState(): string {
  return readFileSync(join(root, "app.txt"), "utf8");
}

test("isGitRepo distinguishes repos from plain directories", () => {
  assert.equal(isGitRepo(root), true);
  const outside = mkdtempSync(join(tmpdir(), "bajajbot-nogit-"));
  try {
    assert.equal(isGitRepo(outside), false);
    assert.equal(createSnapshot(outside, "nope"), null);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("checkpoints chain newest-first and restore old file contents", () => {
  writeFileSync(join(root, "app.txt"), "version 1\n");
  const first = createSnapshot(root, "first turn");
  assert.ok(first);

  writeFileSync(join(root, "app.txt"), "version 2 — edited by agent\n");
  writeFileSync(join(root, "extra.txt"), "created later\n");
  const second = createSnapshot(root, "second turn");
  assert.ok(second && second !== first);

  const snapshots = listSnapshots(root);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].sha, second);
  assert.match(snapshots[0].label, /second turn/);
  assert.equal(snapshots[1].sha, first);

  assert.equal(restoreSnapshot(root, first), true);
  assert.equal(worktreeState(), "version 1\n");
  // files created after the snapshot are intentionally left in place
  assert.equal(readFileSync(join(root, "extra.txt"), "utf8"), "created later\n");

  // user's own git state stays clean: nothing staged, no commits on HEAD
  assert.equal(run(["status", "--porcelain"]).split("\n").every((line) => line.startsWith("??") || line.includes("A ") || line.includes("M ")), true);
  assert.throws(() => run(["rev-parse", "HEAD"]), /HEAD/); // repo had no commits before
});
