import assert from "node:assert/strict";
import { test } from "node:test";
import { changedConfigKeys, describeReload, providerIdentityChanged } from "../src/config/diff.js";
import { CONFIG_ENV_VAR, configIsOverridden, configPath } from "../src/config/store.js";
import type { Config } from "../src/config/types.js";

const base: Config = {
  provider: "custom",
  apiKey: "sk-old",
  baseUrl: "http://127.0.0.1:8799/v1",
  defaultModel: "m/one",
  theme: "dusk",
};

test("changedConfigKeys reports nothing for an identical config", () => {
  assert.deepEqual(changedConfigKeys(base, { ...base }), []);
});

test("changedConfigKeys names a changed scalar", () => {
  assert.deepEqual(changedConfigKeys(base, { ...base, theme: "dawn" }), ["theme"]);
});

test("changedConfigKeys reports a key that appeared with a value", () => {
  assert.deepEqual(changedConfigKeys(base, { ...base, maxTokens: 4096 }), ["maxTokens"]);
});

test("changedConfigKeys reports a key that was removed", () => {
  const before = { ...base, spendLimitUsd: 5 };
  assert.deepEqual(changedConfigKeys(before, base), ["spendLimitUsd"]);
});

test("changedConfigKeys ignores a key that is only absent on one side", () => {
  // undefined and "not present" mean the same thing in JSON.
  assert.deepEqual(changedConfigKeys(base, { ...base, temperature: undefined }), []);
});

test("changedConfigKeys compares arrays by content, not identity", () => {
  const before = { ...base, fallbackModels: ["a", "b"] };
  assert.deepEqual(changedConfigKeys(before, { ...base, fallbackModels: ["a", "b"] }), []);
  assert.deepEqual(changedConfigKeys(before, { ...base, fallbackModels: ["b", "a"] }), ["fallbackModels"]);
});

test("changedConfigKeys compares nested objects by content", () => {
  const before = { ...base, webSearch: { provider: "brave" as const, apiKey: "k" } };
  assert.deepEqual(changedConfigKeys(before, { ...base, webSearch: { provider: "brave", apiKey: "k" } }), []);
  assert.deepEqual(changedConfigKeys(before, { ...base, webSearch: { provider: "tavily", apiKey: "k" } }), [
    "webSearch",
  ]);
});

test("changedConfigKeys orders keys the way a reader meets them", () => {
  const after = { ...base, theme: "dawn", provider: "openrouter" as const, apiKey: "sk-new" };
  assert.deepEqual(changedConfigKeys(base, after), ["provider", "theme", "apiKey"]);
});

test("changedConfigKeys sorts unknown keys after the known ones", () => {
  const after = { ...base, zetaNew: 1, theme: "dawn", alphaNew: 2 } as unknown as Config;
  const changed = changedConfigKeys(base, after);
  assert.deepEqual(changed.slice(0, 1), ["theme"]);
  assert.deepEqual(changed.slice(1).sort(), ["alphaNew", "zetaNew"]);
});

test("changedConfigKeys never returns a secret value, only the key name", () => {
  const changed = changedConfigKeys(base, { ...base, apiKey: "sk-brand-new" });
  assert.deepEqual(changed, ["apiKey"]);
  assert.ok(!changed.some((entry) => entry.includes("sk-brand-new")));
});

test("describeReload says so when nothing changed", () => {
  assert.equal(describeReload(base, { ...base }), "✓ reloaded - no changes");
});

test("describeReload names the changed keys", () => {
  const line = describeReload(base, { ...base, theme: "dawn", maxTokens: 10 });
  assert.equal(line, "✓ reloaded - 2 changed: theme, maxTokens");
});

test("describeReload keeps a short marker for the env-var file", () => {
  assert.equal(describeReload(base, { ...base, theme: "dawn" }, "(env)"), "✓ reloaded (env) - 1 changed: theme");
});

test("describeReload truncates a long change list", () => {
  const after = {
    ...base,
    theme: "dawn",
    maxTokens: 1,
    contextTokens: 2,
    spendLimitUsd: 3,
    temperature: 4,
  };
  assert.equal(describeReload(base, after), "✓ reloaded - 5 changed: theme, temperature +3 more");
});

test("describeReload never lists more than two key names", () => {
  // The status bar shares its row with the model, ctx gauge, and tips, so an
  // unbounded list would truncate mid-way through the names. The count still
  // tells the user how much moved, and they have the file.
  const after = {
    ...base,
    theme: "dawn",
    temperature: 0.5,
    maxTokens: 1,
    contextTokens: 2,
    spendLimitUsd: 3,
    checkpointLimit: 4,
    systemPrompt: "x",
  };
  const line = describeReload(after, base, "(env)");
  assert.match(line, /7 changed: theme, temperature \+5 more$/);
  assert.deepEqual(
    [...line.matchAll(/[a-zA-Z]+(?=,|\s\+)/g)].map((match) => match[0]),
    ["theme", "temperature"],
  );
});

test("describeReload keeps the common single-change case short", () => {
  // One change is the overwhelmingly common reload; it has to survive next to
  // the status bar's left-hand side without being cut off.
  const line = describeReload(base, { ...base, routes: [] }, "(env)");
  assert.equal(line, "✓ reloaded (env) - 1 changed: routes");
  assert.ok(line.length <= 40, `${line} is ${line.length} chars`);
});

test("providerIdentityChanged spots a new endpoint, key, or provider", () => {
  assert.equal(providerIdentityChanged(base, { ...base }), false);
  assert.equal(providerIdentityChanged(base, { ...base, theme: "dawn" }), false);
  assert.equal(providerIdentityChanged(base, { ...base, baseUrl: "http://x/v1" }), true);
  assert.equal(providerIdentityChanged(base, { ...base, apiKey: "sk-new" }), true);
  assert.equal(providerIdentityChanged(base, { ...base, provider: "openrouter" }), true);
});

test("configPath follows BAJAJBOT_CONFIG and resolves it to an absolute path", () => {
  const previous = process.env[CONFIG_ENV_VAR];
  try {
    process.env[CONFIG_ENV_VAR] = "  ./nested/cfg.json  ";
    assert.equal(configPath(), `${process.cwd()}/nested/cfg.json`);
    assert.equal(configIsOverridden(), true);
    process.env[CONFIG_ENV_VAR] = "";
    assert.equal(configIsOverridden(), false);
  } finally {
    if (previous === undefined) delete process.env[CONFIG_ENV_VAR];
    else process.env[CONFIG_ENV_VAR] = previous;
  }
});

test("configPathLabel is not needed by the reload note", () => {
  // The note shows "(env)" rather than a path, so nothing collapses $HOME.
  assert.equal(configPath(), `${process.env.HOME}/.bajajbot/config.json`);
});
