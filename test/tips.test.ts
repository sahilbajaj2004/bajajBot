import assert from "node:assert/strict";
import { test } from "node:test";
import { contextualTip, rotatingTip } from "../src/util/tips.js";

test("contextualTip prioritizes error recovery over context pressure", () => {
  const errored = contextualTip({ errored: true, contextPercent: 95 });
  assert.match(errored, /\/retry/);
});

test("contextualTip suggests export when context runs low", () => {
  assert.match(contextualTip({ contextPercent: 70 }), /\/export/);
  assert.match(contextualTip({ contextPercent: 92 }), /\/export/);
});

test("contextualTip falls back to a default below the threshold", () => {
  assert.doesNotMatch(contextualTip({ contextPercent: 40 }), /\/export/);
  assert.doesNotMatch(contextualTip({}), /\/export/);
});

test("rotatingTip cycles deterministically and tolerates negatives", () => {
  assert.equal(rotatingTip(0), rotatingTip(5));
  assert.notEqual(rotatingTip(0), rotatingTip(1));
  assert.equal(rotatingTip(-1), rotatingTip(4));
});
