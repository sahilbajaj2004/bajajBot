import assert from "node:assert/strict";
import { test } from "node:test";
import { clearModelCache, estimateCost, fetchModels, type ModelInfo } from "../src/provider/models.js";

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

test("fetchModels caches per endpoint+auth for the TTL", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), { status: 200 });
    }) as typeof fetch;
    clearModelCache();
    const first = await fetchModels("https://cache.test/v1", "k");
    const second = await fetchModels("https://cache.test/v1/", "k");
    assert.equal(calls, 1);
    assert.deepEqual(second.map((model) => model.id), first.map((model) => model.id));
    await fetchModels("https://other.test/v1", "k");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearModelCache();
  }
});
