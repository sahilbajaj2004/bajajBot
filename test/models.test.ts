import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateCost, type ModelInfo } from "../src/provider/models.js";

const priced: ModelInfo = {
  id: "vendor/model",
  pricing: { prompt: "0.0000015", completion: "0.000002" },
};

test("estimateCost multiplies per-token pricing strings", () => {
  const cost = estimateCost(priced, 1000, 500);
  assert.ok(Math.abs(cost! - (0.0015 + 0.001)) < 1e-12);
});

test("estimateCost returns null without pricing data", () => {
  assert.equal(estimateCost(undefined, 10, 10), null);
  assert.equal(estimateCost({ id: "x" }, 10, 10), null);
  assert.equal(estimateCost({ id: "x", pricing: {} }, 10, 10), null);
});

test("estimateCost handles partial pricing", () => {
  const cost = estimateCost({ id: "x", pricing: { prompt: "0.000001" } }, 1000, 500);
  assert.ok(Math.abs(cost! - 0.001) < 1e-12);
});
