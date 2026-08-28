import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGitRepo } from "./gitCheckpoints.js";

const GIT_TIMEOUT_MS = 15_000;

export interface CommitStat {
  status: "A" | "M" | "D" | "R" | "??";
  path: string;
  added: number;
  deleted: number;
}

export interface CommitMessage {
  subject: string;
  body: string[];
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", timeout: GIT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
}

/** git() output with surrounding newlines removed, for single-value callers. */
function gitTrim(cwd: string, args: string[]): string {
  return git(cwd, args).trim();
}

function hasHead(cwd: string): boolean {
  try {
    git(cwd, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function countLines(cwd: string, path: string): { added: number; deleted: number } {
  try {
    const content = readFileSync(join(cwd, path), "utf8");
    if (content === "") return { added: 0, deleted: 0 };
    const added = content.endsWith("\n") ? content.split("\n").length - 1 : content.split("\n").length;
    return { added, deleted: 0 };
  } catch {
    return { added: 0, deleted: 0 };
  }
}

/**
 * Every change a `git add -A && git commit` would take in, with +/- line
 * counts. Returns null when the directory is not a git repository, and an
 * empty array when the tree is clean.
 */
export function worktreeChanges(cwd: string): CommitStat[] | null {
  if (!isGitRepo(cwd)) return null;
  const statuses = new Map<string, CommitStat>();
  try {
    for (const line of git(cwd, ["status", "--porcelain"]).split("\n")) {
      if (!line) continue;
      const xy = line.slice(0, 2);
      const path = line.slice(3);
      const renamed = path.match(/^(.+) -> (.+)$/);
      const finalPath = renamed ? renamed[2] : path;
      const stage = xy[0] ?? " ";
      const work = xy[1] ?? " ";
      if (stage === "!" || work === "!") continue; // ignored/conflicted — leave alone
      const status: CommitStat["status"] =
        stage === "?" ? "??" : stage === "R" || work === "R" ? "R" : stage === "D" ? "D" : work === "D" ? "D" : stage === "A" ? "A" : work === "A" ? "A" : stage === "M" || work === "M" ? "M" : stage === "C" ? "A" : "M";
      statuses.set(finalPath, { status, path: finalPath, added: 0, deleted: 0 });
    }
  } catch {
    return null;
  }
  const tracked = hasHead(cwd) ? git(cwd, ["diff", "HEAD", "--numstat", "--no-renames"]).split("\n") : [];
  for (const line of tracked) {
    const [addedText, deletedText, path] = line.split("\t");
    if (!path) continue;
    const record = statuses.get(path);
    if (!record) continue; // reverted since status snapshot — keep status only
    record.added = Number(addedText) || 0;
    record.deleted = Number(deletedText) || 0;
  }
  for (const record of statuses.values()) {
    if (record.status === "??") {
      const counts = countLines(cwd, record.path);
      record.added = counts.added;
      record.deleted = counts.deleted;
    }
  }
  return [...statuses.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function gitUserConfigured(cwd: string): boolean {
  try {
    const name = gitTrim(cwd, ["config", "user.name"]);
    const email = gitTrim(cwd, ["config", "user.email"]);
    return Boolean(name) && Boolean(email);
  } catch {
    return false;
  }
}

/**
 * Bounded working-tree diff (tracked patches + untracked file contents) for
 * the model to write a message from. Never reads more than `limit` chars.
 */
export function diffForContext(cwd: string, limit = 12_000): string {
  const parts: string[] = [];
  if (hasHead(cwd)) {
    const stat = git(cwd, ["diff", "HEAD", "--stat"]).split("\n").slice(0, 8).join("\n");
    if (stat) parts.push(stat);
    const patch = git(cwd, ["diff", "HEAD", "--no-ext-diff", "--no-renames"]).split("\n").slice(0, 200).join("\n");
    if (patch) parts.push(patch);
  }
  let head = parts.join("\n");
  if (head.length >= limit) return head.slice(0, limit);
  const untracked = worktreeChanges(cwd)?.filter((entry) => entry.status === "??") ?? [];
  for (const entry of untracked) {
    try {
      const content = readFileSync(join(cwd, entry.path), "utf8").slice(0, 4000);
      parts.push(`--- ${entry.path}\n+++ ${entry.path}\n@@ (new file)\n${content}`);
    } catch {
      // unreadable — skip
    }
    head = parts.join("\n");
    if (head.length >= limit) return head.slice(0, limit);
  }
  return head;
}

export function filesSummary(cwd: string): string {
  const changes = worktreeChanges(cwd) ?? [];
  if (changes.length === 0) return "no changes";
  const added = changes.reduce((sum, entry) => sum + entry.added, 0);
  const deleted = changes.reduce((sum, entry) => sum + entry.deleted, 0);
  return `${changes.length} files changed, +${added} −${deleted}`;
}

/** Stage everything and make a real commit on the current branch. */
export function commitTree(cwd: string, message: CommitMessage): string {
  git(cwd, ["add", "-A", "."]);
  const args = ["commit", "-m", message.subject];
  for (const line of message.body) {
    if (line.trim()) args.push("-m", line.trim());
  }
  git(cwd, args);
  return gitTrim(cwd, ["rev-parse", "--short", "HEAD"]);
}

/**
 * Turn the model's raw reply into a conventional subject + body bullets:
 * first non-empty line is the subject (<=72 chars), the rest become bullets.
 * Fences, leading dashes/hashes/asterisks and blank noise are stripped.
 */
export function parseCommitMessage(text: string): CommitMessage {
  const cleaned = text.replace(/^```[a-z]*$/gim, "");
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const subject = (lines[0] ?? text.slice(0, 72)).trim().replace(/\s+/g, " ").slice(0, 72);
  const body = lines
    .slice(1)
    .filter((line) => {
      if (!line) return false;
      if (line.startsWith("#")) return false;
      return line.toLowerCase() !== subject.toLowerCase();
    })
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .slice(0, 10);
  return { subject, body };
}