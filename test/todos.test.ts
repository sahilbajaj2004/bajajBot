import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, beforeEach, afterEach } from "node:test";
import { loadTodos, saveTodos, todoTick, updateTodosTool } from "../src/tools/todos.js";
import type { ToolContext } from "../src/tools/types.js";

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "bajajbot-todos-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

const ctx: ToolContext = { cwd: "", confirm: async () => true };

function runTool(args: Record<string, string | undefined>): Promise<string> {
  const cwd = repo;
  return Promise.resolve(updateTodosTool.execute(args, { ...ctx, cwd }));
}

test("saveTodos/loadTodos round-trips and survives a reload", () => {
  saveTodos(repo, [{ text: "write tests", done: false }, { text: "ship it", done: true }]);
  const reloaded = loadTodos(repo);
  assert.equal(reloaded.length, 2);
  assert.equal(reloaded[0]?.text, "write tests");
  assert.equal(reloaded[1]?.done, true);
  assert.ok(existsSync(join(repo, ".bajajbot", "todos.json")));
});

test("loadTodos tolerates a missing or corrupt file", () => {
  assert.deepEqual(loadTodos(repo), []);
  mkdirSync(join(repo, ".bajajbot"), { recursive: true });
  rmSync(join(repo, ".bajajbot", "todos.json"), { force: true });
  assert.deepEqual(loadTodos(repo), []);
});

test("update_todos add/list/toggle/clear round-trip", async () => {
  assert.match(await runTool({ action: "add", text: "implement /todo" }), /Added "implement \/todo"/);
  const list = await runTool({ action: "list" });
  assert.match(list, /- \[ \] implement \/todo/);
  assert.match(await runTool({ action: "toggle", text: "implement /todo" }), /done/);
  assert.match(await runTool({ action: "list" }), /\[x\]/);
  assert.match(await runTool({ action: "clear" }), /Cleared 1 finished todo\(s\)/);
  assert.equal(loadTodos(repo).length, 0);
});

test("update_todos remove and unknown-item errors are friendly", async () => {
  await runTool({ action: "add", text: "alpha" });
  assert.match(await runTool({ action: "toggle", text: "nope" }), /No todo matches/);
  assert.match(await runTool({ action: "remove", text: "alpha" }), /Removed "alpha"/);
  assert.match(await runTool({ action: "remove", text: "alpha" }), /No todo matches/);
});

test("todoTick renders markdown checkboxes", () => {
  assert.equal(todoTick({ text: "x", done: false }), "- [ ] x");
  assert.equal(todoTick({ text: "x", done: true }), "- [x] x");
});