import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { executeTool, parseToolArgs, systemPrompt, toolSchemas } from "../src/tools/index.js";
import type { ToolContext } from "../src/tools/types.js";

const root = mkdtempSync(join(tmpdir(), "bajajbot-tools-"));
const ctx: ToolContext = {
  cwd: root,
  confirm: async () => true,
};

test("tool schemas expose every tool with a function signature", () => {
  const names = toolSchemas().map((schema) => schema.function.name);
  assert.deepEqual(names, ["read_file", "list_dir", "write_file", "edit_file", "delete_path", "run_command", "fetch_url"]);
});

test("write_file creates parents and read_file returns contents", async () => {
  const wrote = await executeTool(
    { name: "write_file", args: JSON.stringify({ path: "src/deep/new.ts", content: "export const x = 1;\n" }) },
    ctx,
  );
  assert.match(wrote, /Wrote \d+ bytes/);

  const missing = await executeTool({ name: "write_file", args: JSON.stringify({ path: "x.ts" }) }, ctx);
  assert.match(missing, /Missing required argument: content/);

  const content = await executeTool({ name: "read_file", args: JSON.stringify({ path: "src/deep/new.ts" }) }, ctx);
  assert.equal(content, "export const x = 1;\n");
});

test("edit_file requires a unique find string", async () => {
  writeFileSync(join(root, "dup.txt"), "alpha beta alpha\n");
  const missing = await executeTool(
    { name: "edit_file", args: JSON.stringify({ path: "dup.txt", find: "gamma", replace: "x" }) },
    ctx,
  );
  assert.match(missing, /not present/);
  const ambiguous = await executeTool(
    { name: "edit_file", args: JSON.stringify({ path: "dup.txt", find: "alpha", replace: "x" }) },
    ctx,
  );
  assert.match(ambiguous, /appears 2 times/);
  const ok = await executeTool(
    { name: "edit_file", args: JSON.stringify({ path: "dup.txt", find: "beta", replace: "b" }) },
    ctx,
  );
  assert.equal(ok, "Edited dup.txt");
  assert.equal(readFileSync(join(root, "dup.txt"), "utf8"), "alpha b alpha\n");
});

test("paths outside the project directory resolve and are readable (confirmation guards writes)", async () => {
  const outside = mkdtempSync(join(tmpdir(), "bajajbot-outside-"));
  try {
    writeFileSync(join(outside, "note.txt"), "hello outside");
    const read = await executeTool(
      { name: "read_file", args: JSON.stringify({ path: join(outside, "note.txt") }) },
      ctx,
    );
    assert.equal(read, "hello outside");
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("list_dir marks directories and rejects missing paths", async () => {
  const listed = await executeTool({ name: "list_dir", args: JSON.stringify({ path: "." }) }, ctx);
  assert.match(listed, /src\//);
  const bad = await executeTool({ name: "list_dir", args: JSON.stringify({ path: "nope" }) }, ctx);
  assert.match(bad, /Not found/);
});

test("delete_path removes files and unknown tools error", async () => {
  writeFileSync(join(root, "gone.txt"), "bye\n");
  const removed = await executeTool({ name: "delete_path", args: JSON.stringify({ path: "gone.txt" }) }, ctx);
  assert.match(removed, /Deleted gone\.txt/);
  assert.equal(existsSync(join(root, "gone.txt")), false);
  const unknown = await executeTool({ name: "teleport", args: "{}" }, ctx);
  assert.match(unknown, /unknown tool/);
});

test("denied confirmations feed the denial back to the model", async () => {
  writeFileSync(join(root, "keep.txt"), "data\n");
  const denied = await executeTool(
    { name: "delete_path", args: JSON.stringify({ path: "keep.txt" }) },
    { cwd: root, confirm: async () => false },
  );
  assert.equal(denied, "User denied this action.");
  assert.equal(existsSync(join(root, "keep.txt")), true);
});

test("parseToolArgs tolerates malformed JSON and non-objects", () => {
  assert.deepEqual(parseToolArgs('{"path":"a.ts"}'), { path: "a.ts" });
  assert.deepEqual(parseToolArgs("not json"), {});
  assert.deepEqual(parseToolArgs("[1,2]"), {});
  assert.deepEqual(parseToolArgs(""), {});
});

test("systemPrompt anchors the assistant to the working directory", () => {
  assert.match(systemPrompt("/tmp/proj"), /Working directory: \/tmp\/proj/);
});
