import assert from "node:assert/strict";
import { test } from "node:test";
import { busyStatus } from "../src/util/busyStatus.js";

test("busyStatus shows waiting phase before the first chunk arrives", () => {
  assert.equal(busyStatus(0, 0), "0s · waiting for first token");
  assert.equal(busyStatus(3.7, 0), "3s · waiting for first token");
});

test("busyStatus estimates tokens from streamed characters once flowing", () => {
  assert.equal(busyStatus(12.4, 1360), "12s · 340 tok");
  assert.equal(busyStatus(1, 3), "1s · 1 tok");
});

test("busyStatus clamps negative input", () => {
  assert.equal(busyStatus(-5, 0), "0s · waiting for first token");
});
