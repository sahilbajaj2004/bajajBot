import assert from "node:assert/strict";
import { test } from "node:test";
import { isInside, escapesProject, executeTool } from "../src/tools/index.js";
import type { ToolContext } from "../src/tools/types.js";

const CWD = "/home/dev/project";

/** A context that records what it was asked to confirm. */
function ctx(approved = true) {
  const asked: { title: string; detail: string }[] = [];
  const context: ToolContext = {
    cwd: CWD,
    confirm: async (title, detail) => {
      asked.push({ title, detail });
      return approved;
    },
    recordMutation: () => {},
    setPlan: () => {},
  };
  return { asked, context };
}

test("isInside accepts the directory itself and its descendants", () => {
  assert.equal(isInside(CWD, CWD), true);
  assert.equal(isInside(CWD, `${CWD}/src/app.ts`), true);
  assert.equal(isInside(CWD, `${CWD}/a/b/c`), true);
});

test("isInside rejects anything that climbs out", () => {
  assert.equal(isInside(CWD, "/etc/passwd"), false);
  assert.equal(isInside(CWD, `${CWD}/../secrets`), false);
  assert.equal(isInside(CWD, `${CWD}/src/../../secrets`), false);
  // A sibling directory sharing a name prefix is not inside.
  assert.equal(isInside(CWD, `${CWD}-evil/x`), false);
  assert.equal(isInside(CWD, "/"), false);
});

test("escapesProject ignores tools with no path argument", () => {
  assert.equal(escapesProject("web_search", { query: "x" }, CWD), false);
  assert.equal(escapesProject("set_plan", {}, CWD), false);
  assert.equal(escapesProject("run_command", { command: "ls" }, CWD), false);
});

test("escapesProject flags an absolute path outside the project", () => {
  assert.equal(escapesProject("read_file", { path: "~/.ssh/id_rsa" }, CWD), true);
  assert.equal(escapesProject("read_file", { path: "/etc/shadow" }, CWD), true);
  assert.equal(escapesProject("list_dir", { path: "../.." }, CWD), true);
});

test("escapesProject allows relative and in-project absolute paths", () => {
  assert.equal(escapesProject("read_file", { path: "src/app.ts" }, CWD), false);
  assert.equal(escapesProject("read_file", { path: "./src/app.ts" }, CWD), false);
  assert.equal(escapesProject("read_file", { path: `${CWD}/src/app.ts` }, CWD), false);
  assert.equal(escapesProject("read_file", { path: "src/../src/app.ts" }, CWD), false);
});

test("escapesProject treats a missing path as inside (it defaults to the project)", () => {
  assert.equal(escapesProject("list_dir", {}, CWD), false);
  assert.equal(escapesProject("list_dir", { path: "   " }, CWD), false);
});

test("a read inside the project is not confirmed", async () => {
  const { asked, context } = ctx();
  await executeTool({ name: "list_dir", args: JSON.stringify({ path: "src" }) }, context);
  assert.deepEqual(asked, []);
});

test("a read outside the project is confirmed", async () => {
  const { asked, context } = ctx();
  await executeTool({ name: "read_file", args: JSON.stringify({ path: "~/.ssh/id_rsa" }) }, context);
  assert.equal(asked.length, 1, "reading outside the project must ask");
  assert.match(asked[0]?.title ?? "", /read_file outside the project/);
});

test("a denied outside read does not touch the filesystem", async () => {
  const { context } = ctx(false);
  const output = await executeTool(
    { name: "read_file", args: JSON.stringify({ path: "/etc/hostname" }) },
    context,
  );
  assert.equal(output, "User denied this action.");
});

test("a risky write inside the project is still confirmed", async () => {
  const { asked, context } = ctx();
  await executeTool({ name: "write_file", args: JSON.stringify({ path: "src/a.ts", content: "x" }) }, context);
  assert.equal(asked.length, 1);
  assert.doesNotMatch(asked[0]?.title ?? "", /outside the project/);
});

test("a risky write outside the project keeps its own title", async () => {
  const { asked, context } = ctx();
  await executeTool({ name: "write_file", args: JSON.stringify({ path: "/tmp/a", content: "x" }) }, context);
  assert.equal(asked.length, 1);
  assert.doesNotMatch(asked[0]?.title ?? "", /outside the project/);
});
