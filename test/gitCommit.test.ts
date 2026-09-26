import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, beforeEach, afterEach } from "node:test";
import {
  commitTree,
  diffForContext,
  gitUserConfigured,
  parseCommitMessage,
  worktreeChanges,
} from "../src/tools/gitCommit.js";

let repo: string;

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "bajajbot-commit-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.name", "Test User"]);
  git(repo, ["config", "user.email", "test@example.com"]);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

test("worktreeChanges is null outside a git repo and empty when clean", () => {
  assert.equal(worktreeChanges(tmpdir()), null);
  writeFileSync(join(repo, "a.txt"), "x\n");
  git(repo, ["add", "-A", "."]);
  git(repo, ["commit", "-qm", "base"]);
  assert.deepEqual(worktreeChanges(repo), []);
});

test("worktreeChanges reports added, modified, and deleted files with line counts", () => {
  writeFileSync(join(repo, "a.txt"), "1\n2\n3\n");
  writeFileSync(join(repo, "c.txt"), "gone\n");
  git(repo, ["add", "-A", "."]);
  git(repo, ["commit", "-qm", "base"]);
  writeFileSync(join(repo, "a.txt"), "1\n2\n3\n4\n5\n");
  writeFileSync(join(repo, "b.txt"), "hello\nworld\n");
  rmSync(join(repo, "c.txt"));
  git(repo, ["add", "-A", "."]);
  const changes = worktreeChanges(repo) ?? [];
  assert.equal(changes.length, 3);
  const byPath = new Map(changes.map((entry) => [entry.path, entry]));
  assert.equal(byPath.get("a.txt")?.status, "M");
  assert.equal(byPath.get("a.txt")?.added, 2);
  assert.equal(byPath.get("a.txt")?.deleted, 0);
  assert.equal(byPath.get("b.txt")?.status, "A");
  assert.equal(byPath.get("b.txt")?.added, 2);
  assert.equal(byPath.get("c.txt")?.status, "D");
  assert.equal(byPath.get("c.txt")?.deleted, 1);
});

test("commitTree stages everything and produces a real commit", () => {
  writeFileSync(join(repo, "c.txt"), "content\n");
  const sha = commitTree(repo, { subject: "feat: add c.txt", body: ["Adds the file"] });
  assert.match(sha, /^[0-9a-f]{7,}$/);
  const message = git(repo, ["log", "-1", "--format=%s%n%b"]);
  assert.equal(message, "feat: add c.txt\nAdds the file");
  assert.deepEqual(worktreeChanges(repo), []);
});

test("gitUserConfigured detects missing identity", () => {
  const oldGlobal = process.env.GIT_CONFIG_GLOBAL;
  const oldSystem = process.env.GIT_CONFIG_SYSTEM;
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  try {
    assert.equal(gitUserConfigured(repo), true);
    git(repo, ["config", "--unset", "user.email"]);
    assert.equal(gitUserConfigured(repo), false);
  } finally {
    if (oldGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = oldGlobal;
    if (oldSystem === undefined) delete process.env.GIT_CONFIG_SYSTEM;
    else process.env.GIT_CONFIG_SYSTEM = oldSystem;
  }
});

test("diffForContext returns a bounded usable patch", () => {
  writeFileSync(join(repo, "d.txt"), "one\ntwo\n");
  const diff = diffForContext(repo, 500);
  assert.match(diff, /d\.txt/);
  assert.ok(diff.length <= 500);
});

test("parseCommitMessage cleans fences, bullets, and long subjects", () => {
  const message = parseCommitMessage(
    "```\nfeat: ship the fallback chain, this subject is far too long and should be truncated at the seventy-second character boundary\n  - Adds auto-failover\n- fixes nothing\n# heading noise\n```",
  );
  assert.equal(message.subject.length, 72);
  assert.ok(message.subject.startsWith("feat: ship the fallback chain"));
  assert.deepEqual(message.body, ["Adds auto-failover", "fixes nothing"]);
});