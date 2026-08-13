import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Command } from "commander";
import { registerConfigCommands } from "../src/commands/configCmd.js";

test("configuration saves and loads", async () => {
  const temporaryHome = mkdtempSync(join(tmpdir(), "bajajbot-test-"));
  const previousHome = process.env.HOME;
  process.env.HOME = temporaryHome;
  const store = await import(`../src/config/store.js?test=${Date.now()}`);
  const config = {
    provider: "openrouter" as const,
    apiKey: "test-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
  };

  try {
    assert.equal(store.configExists(), false);
    store.saveConfig(config);
    assert.deepEqual(store.loadConfig(), config);
    assert.equal(existsSync(join(temporaryHome, ".bajajbot", "sessions")), true);
  } finally {
    previousHome === undefined ? delete process.env.HOME : (process.env.HOME = previousHome);
    rmSync(temporaryHome, { recursive: true, force: true });
  }
});

test("set-model preserves config and show masks API key", async () => {
  const temporaryHome = mkdtempSync(join(tmpdir(), "bajajbot-test-"));
  const previousHome = process.env.HOME;
  process.env.HOME = temporaryHome;
  const store = await import(`../src/config/store.js?test=${Date.now()}`);
  const config = {
    provider: "custom" as const,
    apiKey: "secret-api-key",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "old-model",
  };

  try {
    store.saveConfig(config);
    const setModel = new Command();
    registerConfigCommands(setModel);
    await setModel.parseAsync(["config", "set-model", "new-model"], { from: "user" });
    assert.deepEqual(store.loadConfig(), { ...config, defaultModel: "new-model" });
    let shown = "";
    const originalLog = console.log;
    console.log = (value: string) => { shown = value; };
    try {
      const show = new Command();
      registerConfigCommands(show);
      await show.parseAsync(["config", "show"], { from: "user" });
    } finally {
      console.log = originalLog;
    }
    assert.equal(shown.includes(config.apiKey), false);
  } finally {
    previousHome === undefined ? delete process.env.HOME : (process.env.HOME = previousHome);
    rmSync(temporaryHome, { recursive: true, force: true });
  }
});
