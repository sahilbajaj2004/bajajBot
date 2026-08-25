import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expandHome } from "../src/util/paths.js";

test("expandHome expands ~ and ~/ (and ~\\) to the home directory", () => {
  assert.equal(expandHome("~"), homedir());
  assert.equal(expandHome("~/Downloads"), join(homedir(), "Downloads"));
  assert.equal(expandHome("~\\Downloads"), join(homedir(), "Downloads"));
  assert.equal(expandHome("~/a/b.md"), join(homedir(), "a", "b.md"));
});

test("expandHome leaves other paths untouched", () => {
  assert.equal(expandHome("src/app.ts"), "src/app.ts");
  assert.equal(expandHome("/etc/passwd"), "/etc/passwd");
  assert.equal(expandHome("~user/x"), "~user/x");
  assert.equal(expandHome(""), "");
});
