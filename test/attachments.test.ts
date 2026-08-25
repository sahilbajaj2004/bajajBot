import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expandAttachments, extractAttachments } from "../src/util/attachments.js";

const root = mkdtempSync(join(tmpdir(), "bajajbot-attach-"));
writeFileSync(join(root, "app.ts"), "export const main = () => 0;\n");
writeFileSync(join(root, "notes.md"), "# Notes\n");
writeFileSync(join(root, "big.txt"), `${"x".repeat(70_000)}\n`);

test("extractAttachments keeps only tokens that resolve to existing files", () => {
  const found = extractAttachments("check @app.ts and @missing.ts plus @notes.md.", root);
  assert.deepEqual(found, ["app.ts", "notes.md"]);
});

test("extractAttachments dedupes and ignores emails", () => {
  assert.deepEqual(extractAttachments("@app.ts @app.ts mail me @user@host.com", root), ["app.ts"]);
  assert.deepEqual(extractAttachments("no mentions here", root), []);
});

test("expandAttachments appends fenced blocks and keeps original text first", () => {
  const expanded = expandAttachments("review this @app.ts please", ["app.ts"], root);
  assert.match(expanded, /^review this @app\.ts please\n/);
  assert.match(expanded, /@app\.ts:\n```ts\nexport const main = \(\) => 0;\n```/);
});

test("expandAttachments truncates oversized files and reports missing ones", () => {
  const big = expandAttachments("summarize @big.txt", ["big.txt"], root);
  assert.match(big, /… truncated \(7000\d chars total\)/);

  const missing = expandAttachments("what is @gone.ts?", ["gone.ts"], root);
  assert.match(missing, /@gone\.ts \(could not attach: ENOENT/);
});

test("expandAttachments passes through messages without attachments", () => {
  assert.equal(expandAttachments("plain text", undefined, root), "plain text");
  assert.equal(expandAttachments("plain text", [], root), "plain text");
});

test("round trip: extracted paths expand into one payload", () => {
  const text = "diff @app.ts vs @notes.md";
  const found = extractAttachments(text, root);
  const payload = expandAttachments(text, found, root);
  for (const token of found) assert.ok(payload.includes(`@${token}:`));
});
