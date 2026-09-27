import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configProblems, describeProblems } from "../src/config/validate.js";
import { readConfigAt } from "../src/config/store.js";

const good = {
  provider: "openrouter",
  apiKey: "sk-test",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "openai/gpt-oss-20b:free",
};

const file = (contents: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), "bajajbot-cfg-")), "config.json");
  writeFileSync(path, contents);
  return path;
};

test("a sound config has no problems", () => {
  assert.deepEqual(configProblems(good), []);
});

test("the required fields must be present, non-empty strings", () => {
  assert.ok(configProblems({}).some((p) => p.includes("provider")));
  assert.ok(configProblems({ ...good, apiKey: "  " }).some((p) => p.includes("apiKey")));
  assert.ok(configProblems({ ...good, defaultModel: 7 }).some((p) => p.includes("defaultModel")));
});

test("provider must be a known value", () => {
  assert.ok(configProblems({ ...good, provider: "custm" }).some((p) => p.includes("provider must be one of")));
  assert.deepEqual(configProblems({ ...good, provider: "custom" }), []);
});

test("optional numbers must be numbers", () => {
  for (const key of ["temperature", "maxTokens", "contextTokens", "spendLimitUsd", "checkpointLimit"]) {
    assert.deepEqual(configProblems({ ...good, [key]: 5 }), [], `${key}: 5 should be fine`);
    assert.ok(
      configProblems({ ...good, [key]: "lots" }).some((p) => p.includes(key)),
      `${key}: "lots" should be rejected`,
    );
  }
});

test("a non-finite number is rejected", () => {
  // JSON.parse cannot produce NaN, but a hand-rolled caller can pass one.
  assert.ok(configProblems({ ...good, temperature: Number.NaN }).some((p) => p.includes("temperature")));
});

test("verbosity must be a known level", () => {
  assert.deepEqual(configProblems({ ...good, verbosity: "verbose" }), []);
  assert.ok(configProblems({ ...good, verbosity: "loud" }).some((p) => p.includes("verbosity")));
});

test("list fields must be arrays of strings", () => {
  assert.ok(configProblems({ ...good, favoriteModels: "gpt" }).some((p) => p.includes("favoriteModels")));
  assert.ok(configProblems({ ...good, fallbackModels: [1] }).some((p) => p.includes("fallbackModels")));
  assert.ok(configProblems({ ...good, routes: {} }).some((p) => p.includes("routes")));
  assert.ok(configProblems({ ...good, snippets: "x" }).some((p) => p.includes("snippets")));
});

test("each profile must carry the four fields it needs", () => {
  assert.deepEqual(
    configProblems({ ...good, profiles: { local: { ...good, provider: "custom" } } }),
    [],
  );
  assert.ok(
    configProblems({ ...good, profiles: { local: { provider: "custom" } } }).some((p) =>
      p.includes("profiles.local.apiKey"),
    ),
  );
  assert.ok(configProblems({ ...good, profiles: [] }).some((p) => p.includes("profiles")));
});

test("a non-object is rejected outright", () => {
  assert.deepEqual(configProblems("a string"), ["config is not a JSON object"]);
  assert.deepEqual(configProblems([1, 2]), ["config is not a JSON object"]);
  assert.deepEqual(configProblems(null), ["config is not a JSON object"]);
});

test("describeProblems keeps it to one line and counts the rest", () => {
  const many = configProblems({});
  const line = describeProblems(many) as string;
  assert.ok(!line.includes("\n"));
  assert.match(line, /\+\d+ more/);
  assert.equal(describeProblems([]), null);
});

test("readConfigAt accepts a valid file", () => {
  assert.equal(readConfigAt(file(JSON.stringify(good))).apiKey, "sk-test");
});

test("readConfigAt rejects unparsable JSON with the path", () => {
  const path = file("{ not json");
  assert.throws(() => readConfigAt(path), /corrupted/);
});

test("readConfigAt rejects valid JSON that is not a usable config", () => {
  const path = file(JSON.stringify({ ...good, provider: "custm" }));
  assert.throws(() => readConfigAt(path), /not usable/);
  assert.throws(() => readConfigAt(path), /provider must be one of/);
});
