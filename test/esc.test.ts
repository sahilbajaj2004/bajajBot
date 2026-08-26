import assert from "node:assert/strict";
import { test } from "node:test";
import { DOUBLE_ESC_MS, escAction } from "../src/util/esc.js";

test("first esc arms, second esc inside the window aborts", () => {
  const now = 1_000;
  assert.equal(escAction(null, now), "arm");
  assert.equal(escAction(now + DOUBLE_ESC_MS, now + 100), "abort");
});

test("esc after the window expires re-arms instead of aborting", () => {
  const armedUntil = 1_000 + DOUBLE_ESC_MS;
  assert.equal(escAction(armedUntil, armedUntil), "abort");
  assert.equal(escAction(armedUntil, armedUntil + 1), "arm");
});
