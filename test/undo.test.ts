import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { executeTool } from "../src/tools/index.js";
import { restoreMutations } from "../src/tools/undo.js";
import type { FileMutation, ToolContext } from "../src/tools/types.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeCtx(): { ctx: ToolContext; mutations: FileMutation[]; root: string } {
  const root = mkdtempSync(join(tmpdir(), "bajajbot-undo-"));
  const mutations: FileMutation[] = [];
  return {
    root,
    mutations,
    ctx: {
      cwd: root,
      confirm: async () => true,
      recordMutation: (mutation) => mutations.push(mutation),
    },
  };
}

test("undo reverts a file created by write_file", async () => {
  const { ctx, mutations, root } = makeCtx();
  await executeTool({ name: "write_file", args: JSON.stringify({ path: "new.ts", content: "export const x = 1;\n" }) }, ctx);
  assert.ok(existsSync(join(root, "new.ts")));
  restoreMutations(mutations);
  assert.equal(existsSync(join(root, "new.ts")), false);
  rmSync(root, { recursive: true, force: true });
});

test("undo restores the original content after edit_file", async () => {
  const { ctx, mutations, root } = makeCtx();
  writeFileSync(join(root, "app.ts"), "const a = 1;\n");
  await executeTool(
    { name: "edit_file", args: JSON.stringify({ path: "app.ts", find: "const a = 1;", replace: "const a = 2;" }) },
    ctx,
  );
  assert.equal(readFileSync(join(root, "app.ts"), "utf8"), "const a = 2;\n");
  restoreMutations(mutations);
  assert.equal(readFileSync(join(root, "app.ts"), "utf8"), "const a = 1;\n");
  rmSync(root, { recursive: true, force: true });
});

test("undo restores a deleted file and directory tree", async () => {
  const { ctx, mutations, root } = makeCtx();
  mkdirSync(join(root, "pkg", "inner"), { recursive: true });
  writeFileSync(join(root, "pkg", "a.txt"), "A");
  writeFileSync(join(root, "pkg", "inner", "b.txt"), "B");
  await executeTool({ name: "delete_path", args: JSON.stringify({ path: "pkg" }) }, ctx);
  assert.equal(existsSync(join(root, "pkg")), false);
  const { restored, skipped } = restoreMutations(mutations);
  assert.equal(restored, 1);
  assert.equal(skipped, 0);
  assert.equal(readFileSync(join(root, "pkg", "a.txt"), "utf8"), "A");
  assert.equal(readFileSync(join(root, "pkg", "inner", "b.txt"), "utf8"), "B");
  rmSync(root, { recursive: true, force: true });
});

test("undo applies mutations in reverse order (write then delete restores original)", async () => {
  const { ctx, mutations, root } = makeCtx();
  writeFileSync(join(root, "keep.txt"), "original");
  await executeTool({ name: "write_file", args: JSON.stringify({ path: "keep.txt", content: "changed" }) }, ctx);
  await executeTool({ name: "delete_path", args: JSON.stringify({ path: "keep.txt" }) }, ctx);
  assert.equal(existsSync(join(root, "keep.txt")), false);
  restoreMutations(mutations);
  assert.equal(readFileSync(join(root, "keep.txt"), "utf8"), "original");
  rmSync(root, { recursive: true, force: true });
});
