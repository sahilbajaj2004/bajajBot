import assert from "node:assert/strict";
import { test } from "node:test";
import { paletteMatch } from "../src/ui/palette.js";
import type { CommandDef } from "../src/ui/commands.js";

const command: CommandDef = { name: "/model", description: "Switch model (no arg opens picker)" };

test("paletteMatch matches bare name, description, and empty query", () => {
  assert.equal(paletteMatch("", command), true);
  assert.equal(paletteMatch("/model", command), true);
  assert.equal(paletteMatch("model", command), true);
  assert.equal(paletteMatch("switch", command), true);
  assert.equal(paletteMatch("picker", command), true);
  assert.equal(paletteMatch("zzz", command), false);
  assert.equal(paletteMatch("/todo", command), false);
});