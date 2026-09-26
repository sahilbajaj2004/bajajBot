import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { executeTool, systemPrompt } from "../src/tools/index.js";
import { forget, memoryPromptBlock, readMemory, remember } from "../src/tools/memory.js";
import type { ToolContext } from "../src/tools/types.js";

const made: string[] = [];
after(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function homeOpts(): { home: string } {
  const dir = mkdtempSync(join(tmpdir(), "bajajbot-mem-"));
  made.push(dir);
  return { home: dir };
}

test("remember stores facts, dedupes, and forget removes by fragment", () => {
  const opts = homeOpts();
  assert.deepEqual(readMemory(opts), []);

  assert.equal(remember("user prefers pnpm", opts).saved, true);
  assert.equal(remember("User Prefers Pnpm", opts).duplicate, true); // case-insensitive dupe
  assert.deepEqual(readMemory(opts), ["user prefers pnpm"]);

  remember("project uses vitest", opts);
  remember("deploy target is fly.io", opts);
  assert.equal(readMemory(opts).length, 3);

  assert.equal(forget("pnpm", opts), 1);
  assert.deepEqual(readMemory(opts), ["project uses vitest", "deploy target is fly.io"]);
  assert.equal(forget("does-not-match", opts), 0);

  // empty facts are rejected
  assert.equal(remember("   ", opts).saved, false);
});

test("memory caps at 200 facts, dropping oldest", () => {
  const opts = homeOpts();
  for (let index = 0; index < 205; index++) remember(`fact number ${index}`, opts);
  const facts = readMemory(opts);
  assert.equal(facts.length, 200);
  assert.equal(facts[0], "fact number 5"); // oldest five dropped
  assert.equal(facts[199], "fact number 204");
});

test("memoryPromptBlock injects recent facts within budget", () => {
  const opts = homeOpts();
  assert.equal(memoryPromptBlock(opts), ""); // empty memory → no block

  remember("likes concise answers", opts);
  remember("runs arch linux", opts);
  const block = memoryPromptBlock(opts);
  assert.match(block, /Persistent memory/);
  assert.match(block, /likes concise answers/);
  assert.match(block, /runs arch linux/);

  // oversized history stays within the prompt budget
  const big = homeOpts();
  for (let index = 0; index < 200; index++) remember(`fact ${index} ${"x".repeat(200)}`, big);
  assert.ok(memoryPromptBlock(big).length <= 1600);
});

test("memory tool saves, lists and forgets through executeTool", async () => {
  const ctx: ToolContext = { cwd: process.cwd(), confirm: async () => true };
  const marker = `bajajbot-test-${Date.now()}`;
  try {
    const saved = await executeTool({ name: "memory", args: JSON.stringify({ action: "save", fact: marker }) }, ctx);
    assert.match(saved, /Saved to memory/);
    const listed = await executeTool({ name: "memory", args: JSON.stringify({ action: "list" }) }, ctx);
    assert.match(listed, new RegExp(marker));
    const dupe = await executeTool({ name: "memory", args: JSON.stringify({ action: "save", fact: marker }) }, ctx);
    assert.match(dupe, /Already in memory/);
    const removed = await executeTool({ name: "memory", args: JSON.stringify({ action: "forget", fact: marker }) }, ctx);
    assert.match(removed, /Removed 1 memory entry/);
  } finally {
    forget(marker); // never leak test facts into the user's real memory
  }
});

test("systemPrompt teaches the memory tool and injects known facts", () => {
  remember(`systemprompt-check-${Date.now()}`);
  const prompt = systemPrompt(process.cwd());
  assert.match(prompt, /persistent memory/);
  assert.match(prompt, /memory tool/);
});
