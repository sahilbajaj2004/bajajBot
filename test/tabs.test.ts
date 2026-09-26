import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { initialTabOrder, MAX_OPEN_TABS, saveOpenTabs } from "../src/session/tabs.js";
import { createSession, saveSession } from "../src/session/history.js";

let home: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "bajajbot-tabs-"));
  process.env.HOME = home;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});

test("initialTabOrder returns just the boot session when nothing was open", () => {
  assert.deepEqual(initialTabOrder("/repo", "chat-new"), ["chat-new"]);
});

test("initialTabOrder restores saved tabs ahead of the session we booted with", () => {
  saveSession(createSession("gpt-4o"));
  saveSession(createSession("gpt-4o"));
  const [first, second] = [createSession("gpt-4o"), createSession("gpt-4o")];
  saveSession(first);
  saveSession(second);
  saveOpenTabs("/repo", [first.id, second.id]);

  const order = initialTabOrder("/repo", "chat-fresh");
  assert.deepEqual(order, [first.id, second.id, "chat-fresh"]);
});

test("initialTabOrder drops tabs whose session file is gone", () => {
  const kept = createSession("gpt-4o");
  saveSession(kept);
  saveOpenTabs("/repo", [kept.id, "chat-deleted"]);

  assert.deepEqual(initialTabOrder("/repo", "chat-fresh"), [kept.id, "chat-fresh"]);
});

test("initialTabOrder does not duplicate the boot session", () => {
  const existing = createSession("gpt-4o");
  saveSession(existing);
  saveOpenTabs("/repo", [existing.id]);

  assert.deepEqual(initialTabOrder("/repo", existing.id), [existing.id]);
});

test("open tabs are scoped per project directory", () => {
  const a = createSession("gpt-4o");
  const b = createSession("gpt-4o");
  saveSession(a);
  saveSession(b);
  saveOpenTabs("/repo-a", [a.id]);
  saveOpenTabs("/repo-b", [b.id]);

  assert.deepEqual(initialTabOrder("/repo-a", "x"), [a.id, "x"]);
  assert.deepEqual(initialTabOrder("/repo-b", "x"), [b.id, "x"]);
});

test("saveOpenTabs keeps only the most recent MAX_OPEN_TABS entries", () => {
  // Real sessions on disk, so the restore filter keeps them.
  const ids = Array.from({ length: MAX_OPEN_TABS + 4 }, () => {
    const session = createSession("gpt-4o");
    saveSession(session);
    return session.id;
  });
  saveOpenTabs("/repo", ids);

  const order = initialTabOrder("/repo", "chat-boot");
  // The file keeps 8; the boot session takes one slot, so 7 come back.
  assert.equal(order.length, MAX_OPEN_TABS);
  assert.equal(order.at(-1), "chat-boot");
  assert.equal(order[0], ids[5]);
  assert.ok(!order.includes(ids[4]), "the oldest saved tab is the one dropped");
});

test("a corrupt tabs file is ignored rather than fatal", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(join(home, ".bajajbot"), { recursive: true });
  writeFileSync(join(home, ".bajajbot", "tabs.json"), "{not json");
  assert.deepEqual(initialTabOrder("/repo", "chat-new"), ["chat-new"]);
});
