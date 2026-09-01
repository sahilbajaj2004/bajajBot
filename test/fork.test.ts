import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { forkSession, listSessions, loadSession, saveSession } from "../src/session/history.js";
import type { Session } from "../src/session/types.js";

let home: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "bajajbot-fork-"));
  process.env.HOME = home;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});

function makeSession(): Session {
  return {
    id: "chat-123",
    createdAt: "t1",
    updatedAt: "t2",
    model: "gpt-4o",
    title: "Fix the bundler",
    messages: [
      { role: "user", content: "Fix the bundler", timestamp: "t1" },
      { role: "assistant", content: "Looking into it", timestamp: "t1", toolCalls: [{ id: "c1", name: "search_files", args: "{}" }] },
    ],
    plan: [{ task: "reproduce", status: "pending" }],
    usage: { requests: 2, promptTokens: 100, completionTokens: 50, costUsd: 0.01 },
  };
}

test("forkSession clones messages/plan/usage, gets a new id and parentId, and saves", () => {
  const parent = makeSession();
  saveSession(parent);

  const fork = forkSession(parent);
  assert.notEqual(fork.id, parent.id);
  assert.equal(fork.parentId, parent.id);
  assert.deepEqual(fork.messages, parent.messages);
  assert.deepEqual(fork.plan, parent.plan);
  assert.deepEqual(fork.usage, parent.usage);
  assert.equal(fork.model, parent.model);
  assert.equal(fork.title, parent.title);

  // saved to disk and listed with parentId
  assert.deepEqual(loadSession(fork.id), fork);
  const listed = listSessions();
  assert.ok(listed.some((entry) => entry.id === fork.id && entry.parentId === parent.id));

  // messages are deep copies, not references
  fork.messages[0].content = "changed";
  assert.equal(parent.messages[0].content, "Fix the bundler");
});