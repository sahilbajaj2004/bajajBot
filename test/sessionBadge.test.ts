import assert from "node:assert/strict";
import { test } from "node:test";
import { shortSessionId } from "../src/ui/title.js";

test("shortSessionId strips the ses_ prefix and keeps 4 chars", () => {
  assert.equal(shortSessionId("ses_fc68a88d8ffemEtAa7EGaZXzXa"), "fc68");
  assert.equal(shortSessionId("ses_ab12"), "ab12");
});

test("shortSessionId handles ids without prefix and short ids", () => {
  assert.equal(shortSessionId("abc12345"), "abc1");
  assert.equal(shortSessionId("ab"), "ab");
  assert.equal(shortSessionId(""), "");
});
