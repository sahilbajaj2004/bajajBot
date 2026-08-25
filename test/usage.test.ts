import assert from "node:assert/strict";
import { test } from "node:test";
import { addUsage, aggregateUsage, emptyUsage } from "../src/session/usage.js";
import { deriveSessionTitle } from "../src/ui/title.js";
import type { Session } from "../src/session/types.js";

function session(model: string, usage?: Session["usage"]): Session {
  return { id: "s", createdAt: "t", updatedAt: "t", model, messages: [], ...(usage ? { usage } : {}) };
}

test("aggregateUsage sums sessions and breaks down by model", () => {
  const totals = aggregateUsage([
    session("m/a", { requests: 2, promptTokens: 100, completionTokens: 50, costUsd: 0.01 }),
    session("m/a", { requests: 1, promptTokens: 10, completionTokens: 5, costUsd: 0.001 }),
    session("m/b", { requests: 3, promptTokens: 900, completionTokens: 300, costUsd: 0.5 }),
    session("m/c"),
  ]);
  assert.equal(totals.sessions, 4);
  assert.equal(totals.requests, 6);
  assert.equal(totals.promptTokens, 1010);
  assert.equal(totals.completionTokens, 355);
  assert.ok(Math.abs(totals.costUsd - 0.511) < 1e-9);
  assert.deepEqual(
    totals.byModel.map((entry) => entry.model),
    ["m/b", "m/a"],
  );
  assert.equal(totals.byModel[0].requests, 3);
});

test("aggregateUsage handles empty input and zero-usage sessions", () => {
  const empty = aggregateUsage([]);
  assert.equal(empty.sessions, 0);
  assert.equal(empty.requests, 0);
  assert.equal(empty.byModel.length, 0);

  const untouched = aggregateUsage([session("m"), session("m")]);
  assert.equal(untouched.requests, 0);
});

test("addUsage merges deltas onto a running total", () => {
  let total = emptyUsage();
  total = addUsage(total, { requests: 1, promptTokens: 10, completionTokens: 5, costUsd: 0.25 });
  total = addUsage(total, { requests: 1, promptTokens: 30, completionTokens: 15, costUsd: 0.75 });
  assert.deepEqual(total, { requests: 2, promptTokens: 40, completionTokens: 20, costUsd: 1 });
});

test("deriveSessionTitle trims long prompts and skips compaction bridges", () => {
  assert.equal(deriveSessionTitle("fix the login bug"), "fix the login bug");
  assert.equal(deriveSessionTitle(`x`.repeat(80)), `${"x".repeat(47)}…`);
  assert.equal(deriveSessionTitle("[Earlier conversation summarized]"), undefined);
  assert.equal(deriveSessionTitle(), undefined);
});
