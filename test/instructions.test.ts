import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { instructionsBlock, loadInstructions } from "../src/tools/instructions.js";
import { systemPrompt } from "../src/tools/index.js";

const made: string[] = [];
after(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "bajajbot-instr-"));
  made.push(dir);
  return dir;
}

test("loadInstructions finds project BAJAJBOT.md and falls back to .bajajbot/", () => {
  const root = scratch();
  assert.equal(loadInstructions(root, { home: root }).projectPath, undefined);
  assert.equal(loadInstructions(root, { home: root }).text, "");

  writeFileSync(join(root, "BAJAJBOT.md"), "always use pnpm\n");
  const loaded = loadInstructions(root, { home: root });
  assert.equal(loaded.projectPath, join(root, "BAJAJBOT.md"));
  assert.match(loaded.text, /always use pnpm/);

  // .bajajbot/ variant is found when the root file is absent
  const nested = scratch();
  mkdirSync(join(nested, ".bajajbot"));
  writeFileSync(join(nested, ".bajajbot", "BAJAJBOT.md"), "nested rules\n");
  assert.match(loadInstructions(nested, { home: nested }).text, /nested rules/);
});

test("global instructions are prepended to project ones", () => {
  const root = scratch();
  const home = scratch();
  mkdirSync(join(home, ".bajajbot"));
  writeFileSync(join(home, ".bajajbot", "BAJAJBOT.md"), "be terse\n");
  writeFileSync(join(root, "BAJAJBOT.md"), "use tabs\n");
  const text = loadInstructions(root, { home }).text;
  assert.match(text, /\(global\)[\s\S]*be terse[\s\S]*\(project\)[\s\S]*use tabs/);
});

test("instructionsBlock wraps content and systemPrompt includes it", () => {
  const root = scratch();
  writeFileSync(join(root, "BAJAJBOT.md"), "never touch /legacy\n");
  const block = instructionsBlock(root, { home: root });
  assert.match(block, /standing instructions/);
  assert.match(block, /never touch \/legacy/);
  assert.match(systemPrompt(root), /never touch \/legacy/);

  const empty = scratch();
  assert.equal(instructionsBlock(empty, { home: empty }), "");
  assert.ok(!systemPrompt(empty).includes("standing instructions"));
});

test("oversized instructions are truncated to the budget", () => {
  const root = scratch();
  writeFileSync(join(root, "BAJAJBOT.md"), `x`.repeat(20_000));
  const { text } = loadInstructions(root, { home: root });
  assert.ok(text.length < 20_000);
  assert.match(text, /truncated/);
});
