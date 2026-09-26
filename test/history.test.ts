import assert from "node:assert/strict";
import { test } from "node:test";
import { cycleHistory } from "../src/ui/history.js";

const HISTORY = ["first", "second", "third"];

test("up arrow recalls newest then older entries", () => {
  assert.deepEqual(cycleHistory(HISTORY, null, -1), { draft: "third", index: 2 });
  assert.deepEqual(cycleHistory(HISTORY, 2, -1), { draft: "second", index: 1 });
  assert.deepEqual(cycleHistory(HISTORY, 0, -1), { draft: "first", index: 0 });
});

test("down arrow moves forward and clears past the newest entry", () => {
  assert.deepEqual(cycleHistory(HISTORY, 1, 1), { draft: "third", index: 2 });
  assert.deepEqual(cycleHistory(HISTORY, 2, 1), { draft: "", index: null });
  assert.deepEqual(cycleHistory(HISTORY, null, 1), { draft: "", index: null });
});

test("empty history is a no-op", () => {
  assert.deepEqual(cycleHistory([], null, -1), { draft: "", index: null });
});
