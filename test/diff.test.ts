import assert from "node:assert/strict";
import { test } from "node:test";
import { unifiedDiff } from "../src/util/diff.js";

test("identical texts produce no diff", () => {
  assert.equal(unifiedDiff("same\nlines\n", "same\nlines\n"), "");
});

test("modified line shows removal and addition with context", () => {
  const oldText = "alpha\nbeta\ngamma\ndelta\nepsilon\nzeta\neta\ntheta\n";
  const newText = "alpha\nbeta\ngamma\nDELTA\nepsilon\nzeta\neta\ntheta\n";
  const diff = unifiedDiff(oldText, newText);
  const lines = diff.split("\n");
  assert.ok(lines.some((line) => line.startsWith("- delta")), diff);
  assert.ok(lines.some((line) => line.startsWith("+ DELTA")), diff);
  assert.ok(lines.includes("  gamma"), diff);
  assert.equal(lines[0], "  beta");
});

test("new file is all additions", () => {
  const diff = unifiedDiff("", "one\ntwo\n");
  assert.match(diff, /^\+ one/m);
  assert.match(diff, /^\+ two/m);
});

test("deletions show removed lines only", () => {
  const diff = unifiedDiff("keep\ngone\nmore\n", "keep\nmore\n");
  assert.match(diff, /^- gone$/m);
  assert.doesNotMatch(diff, /^\+ /m);
});

test("large changed regions are capped", () => {
  const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n");
  const diff = unifiedDiff("start\n", `${"start\n"}${big}\n`);
  assert.ok(diff.split("\n").length < 60, String(diff.split("\n").length));
});
