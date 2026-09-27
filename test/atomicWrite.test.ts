import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "../src/util/atomicWrite.js";

const dir = (): string => mkdtempSync(join(tmpdir(), "bajajbot-atomic-"));

test("writeFileAtomic writes the contents", () => {
  const root = dir();
  const path = join(root, "a.json");
  writeFileAtomic(path, '{"a":1}\n');
  assert.equal(readFileSync(path, "utf8"), '{"a":1}\n');
});

test("writeFileAtomic replaces an existing file wholesale", () => {
  const root = dir();
  const path = join(root, "a.json");
  // A longer previous payload: a truncating write would leave a tail behind.
  writeFileAtomic(path, `${"x".repeat(500)}`);
  writeFileAtomic(path, "short\n");
  assert.equal(readFileSync(path, "utf8"), "short\n");
});

test("writeFileAtomic applies the mode", () => {
  const root = dir();
  const path = join(root, "secret.json");
  writeFileAtomic(path, "{}", 0o600);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("writeFileAtomic tightens the mode even on a permissive umask", () => {
  const root = dir();
  const path = join(root, "secret.json");
  // Simulate a pre-existing world-readable file: the mode must still land.
  writeFileSync(path, "old");
  chmodSync(path, 0o644);
  writeFileAtomic(path, "{}", 0o600);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("writeFileAtomic leaves no temp file behind", () => {
  const root = dir();
  writeFileAtomic(join(root, "a.json"), "a");
  writeFileAtomic(join(root, "b.json"), "b");
  assert.deepEqual(readdirSync(root).sort(), ["a.json", "b.json"]);
});

test("writeFileAtomic writes the temp file beside the target, not in /tmp", () => {
  // A cross-filesystem rename is not atomic, so the temp has to share a
  // directory with its target.
  const root = dir();
  const path = join(root, "a.json");
  writeFileAtomic(path, "a");
  assert.ok(!readdirSync(tmpdir()).some((entry) => entry.includes("a.json")), "temp leaked into tmpdir");
});
