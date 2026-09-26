import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { execFileSync } from "node:child_process";
import { normalizePlanItems, setPlanTool } from "../src/tools/plan.js";
import { executeTool, toolSchemas } from "../src/tools/index.js";
import { createSnapshot, sessionChangedFiles } from "../src/tools/gitCheckpoints.js";
import type { ToolContext } from "../src/tools/types.js";

after(() => {
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const madeDirs: string[] = [];

test("normalizePlanItems coerces model output into a clean board", () => {
  const items = normalizePlanItems([
    { task: "  write tests ", status: "done" },
    { task: "", status: "pending" },
    { task: "no status" },
    { task: "weird", status: "banana" },
    null,
    "not an object",
    { task: "ship it", status: "in_progress" },
  ]);
  assert.deepEqual(items, [
    { task: "write tests", status: "done" },
    { task: "no status", status: "pending" },
    { task: "weird", status: "pending" },
    { task: "ship it", status: "in_progress" },
  ]);
  assert.equal(normalizePlanItems("nope").length, 0);
  assert.equal(normalizePlanItems(null).length, 0);

  const huge = Array.from({ length: 50 }, (_, index) => ({ task: `t${index}`, status: "pending" }));
  assert.equal(normalizePlanItems(huge).length, 20);
});

test("set_plan routes items through ctx.setPlan and reports progress", async () => {
  let received: unknown;
  const ctx: ToolContext = {
    cwd: process.cwd(),
    confirm: async () => true,
    setPlan: (items) => (received = items),
  };
  const output = await executeTool(
    { name: "set_plan", args: JSON.stringify({ items: [{ task: "a", status: "done" }, { task: "b", status: "pending" }] }) },
    ctx,
  );
  assert.match(output, /Plan updated: 1\/2 done/);
  assert.deepEqual(received, [
    { task: "a", status: "done" },
    { task: "b", status: "pending" },
  ]);

  const cleared = await executeTool({ name: "set_plan", args: "{}" }, ctx);
  assert.equal(cleared, "Plan cleared.");
  assert.deepEqual(received, []);

  const names = toolSchemas().map((schema) => schema.function.name);
  assert.ok(names.includes("set_plan"));
  void setPlanTool;
});

test("sessionChangedFiles reports A/M/D between first and latest checkpoint", async () => {
  const root = mkdtempSync(join(tmpdir(), "bajajbot-changes-"));
  madeDirs.push(root);
  const run = (args: string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  run(["init"]);
  run(["config", "user.email", "t@t"]);
  run(["config", "user.name", "t"]);

  // fewer than two checkpoints → no changes
  assert.deepEqual(sessionChangedFiles(root), []);

  writeFileSync(join(root, "kept.txt"), "v1\n");
  writeFileSync(join(root, "gone.txt"), "bye\n");
  await createSnapshot(root, "turn 1");
  assert.deepEqual(sessionChangedFiles(root).length, 0);

  writeFileSync(join(root, "kept.txt"), "v2\n");
  writeFileSync(join(root, "new.txt"), "hello\n");
  rmSync(join(root, "gone.txt"));
  await createSnapshot(root, "turn 2");

  const changes = sessionChangedFiles(root);
  const byPath = new Map(changes.map((entry) => [entry.path, entry.status]));
  assert.equal(byPath.get("kept.txt"), "M");
  assert.equal(byPath.get("new.txt"), "A");
  assert.equal(byPath.get("gone.txt"), "D");
});
