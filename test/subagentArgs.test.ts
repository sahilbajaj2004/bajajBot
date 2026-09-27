import assert from "node:assert/strict";
import { test } from "node:test";
import { describeBatchModel, parseSubagentArgs } from "../src/ui/subagentArgs.js";

test("parseSubagentArgs splits tasks on commas, pipes, and newlines", () => {
  assert.deepEqual(parseSubagentArgs("a, b | c\nd").tasks, [{ task: "a" }, { task: "b" }, { task: "c" }, { task: "d" }]);
});

test("parseSubagentArgs leaves a single-colon task alone", () => {
  // The single colon is the trap: "TODO: fix it" is a task, not a model.
  assert.deepEqual(parseSubagentArgs("find TODO: fix the parser").tasks, [
    { task: "find TODO: fix the parser" },
  ]);
});

test("parseSubagentArgs reads a batch model from --model", () => {
  const parsed = parseSubagentArgs("--model gpt-5 a, b");
  assert.equal(parsed.model, "gpt-5");
  assert.deepEqual(parsed.tasks, [{ task: "a" }, { task: "b" }]);
});

test("parseSubagentArgs accepts -m as the batch model", () => {
  assert.equal(parseSubagentArgs("-m gpt-5 a").model, "gpt-5");
});

test("parseSubagentArgs reads a per-task model after ::", () => {
  assert.deepEqual(parseSubagentArgs("gpt-5::summarize README, review src").tasks, [
    { task: "summarize README", model: "gpt-5" },
    { task: "review src" },
  ]);
});

test("parseSubagentArgs does not read a space-containing prefix as a model", () => {
  // C++-style scope in a task: the prefix rule must not capture "find Foo".
  assert.deepEqual(parseSubagentArgs("find Foo::bar usages").tasks, [
    { task: "find Foo::bar usages" },
  ]);
});

test("parseSubagentArgs treats a bare :: prefix as an explicit model marker", () => {
  assert.deepEqual(parseSubagentArgs("src::foo").tasks, [{ task: "foo", model: "src" }]);
});

test("parseSubagentArgs combines a batch model with per-task overrides", () => {
  const parsed = parseSubagentArgs("--model batch/m1 cheap::a, b");
  assert.equal(parsed.model, "batch/m1");
  assert.deepEqual(parsed.tasks, [{ task: "a", model: "cheap" }, { task: "b" }]);
});

test("parseSubagentArgs ignores a trailing --model with no value", () => {
  const parsed = parseSubagentArgs("a, --model");
  assert.equal(parsed.model, undefined);
  assert.deepEqual(parsed.tasks, [{ task: "a" }]);
});

test("parseSubagentArgs does not swallow a task that follows --model-less text", () => {
  const parsed = parseSubagentArgs("--model x");
  assert.equal(parsed.model, "x");
  assert.deepEqual(parsed.tasks, []);
});

test("parseSubagentArgs takes a model id holding a slash", () => {
  const parsed = parseSubagentArgs("--model openai/gpt-5 a");
  assert.equal(parsed.model, "openai/gpt-5");
  assert.deepEqual(parsed.tasks, [{ task: "a" }]);
});

test("parseSubagentArgs accepts --model=value as well as --model value", () => {
  assert.equal(parseSubagentArgs("--model=gpt-5 a").model, "gpt-5");
});

test("parseSubagentArgs returns nothing for empty input", () => {
  assert.deepEqual(parseSubagentArgs("").tasks, []);
  assert.deepEqual(parseSubagentArgs("   ,  , ").tasks, []);
});

test("describeBatchModel names the shared model once", () => {
  assert.equal(describeBatchModel(["m", "m"], "fallback"), "m");
});

test("describeBatchModel counts a mixed batch", () => {
  assert.equal(describeBatchModel(["a", "b"], "fallback"), "2 models");
  assert.equal(describeBatchModel(["a", "b", "c"], "fallback"), "3 models");
});

test("describeBatchModel falls back when the batch is empty", () => {
  assert.equal(describeBatchModel([], "session/m1"), "session/m1");
});
