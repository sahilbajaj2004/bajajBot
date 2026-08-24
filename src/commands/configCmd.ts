import type { Command } from "commander";
import { render } from "ink";
import { createElement } from "react";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { OPENROUTER_URL } from "../config/constants.js";
import { configExists, loadConfig, saveConfig, removeConfig } from "../config/store.js";
import type { Config } from "../config/types.js";
import { normalizeBaseUrl } from "../util/url.js";
import { SetupWizard } from "../ui/Setup.js";

function maskApiKey(apiKey: string): string {
  return apiKey.length <= 8 ? "********" : `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage BajajBot configuration");

  config.command("init").description("Create configuration").action(async () => {
    const created = await initConfig();
    if (!created) console.log("Setup cancelled.");
  });

  config.command("set-model <id>").description("Change default model").action(async (defaultModel: string) => {
    const current = await ensureConfig();
    saveConfig({ ...current, defaultModel });
    console.log(`Default model: ${defaultModel}`);
  });

  config
    .command("set <key> <value...>")
    .description("Set temperature (0-2), maxTokens (int) or systemPrompt")
    .action(async (key: string, value: string[]) => {
      const current = await ensureConfig();
      const text = value.join(" ").trim();
      if (key === "temperature") {
        const temperature = Number(text);
        if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
          console.log("temperature must be a number between 0 and 2.");
          process.exitCode = 1;
          return;
        }
        saveConfig({ ...current, temperature });
        console.log(`temperature = ${temperature}`);
      } else if (key === "maxTokens") {
        const maxTokens = Number(text);
        if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
          console.log("maxTokens must be a positive integer.");
          process.exitCode = 1;
          return;
        }
        saveConfig({ ...current, maxTokens });
        console.log(`maxTokens = ${maxTokens}`);
      } else if (key === "systemPrompt") {
        if (!text) {
          console.log("Usage: bajajbot config set systemPrompt <text> (or `config unset systemPrompt`)");
          process.exitCode = 1;
          return;
        }
        saveConfig({ ...current, systemPrompt: text });
        console.log(`systemPrompt = "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`);
      } else {
        console.log(`Unknown key "${key}". Supported: temperature, maxTokens, systemPrompt`);
        process.exitCode = 1;
      }
    });

  config
    .command("unset <key>")
    .description("Clear temperature, maxTokens or systemPrompt")
    .action(async (key: string) => {
      const current = await ensureConfig();
      if (key !== "temperature" && key !== "maxTokens" && key !== "systemPrompt") {
        console.log(`Unknown key "${key}". Supported: temperature, maxTokens, systemPrompt`);
        process.exitCode = 1;
        return;
      }
      const next = { ...current } as Partial<Config>;
      delete next[key];
      saveConfig(next as Config);
      console.log(`${key} cleared.`);
    });

  const profile = program.command("profile").description("Save and switch provider profiles");

  profile.command("save <name>").description("Save current provider settings as a profile").action(async (name: string) => {
    const current = await ensureConfig();
    const profiles = { ...(current.profiles ?? {}) };
    profiles[name] = { provider: current.provider, apiKey: current.apiKey, baseUrl: current.baseUrl, defaultModel: current.defaultModel };
    saveConfig({ ...current, profiles });
    console.log(`Profile "${name}" saved (${current.provider} · ${current.defaultModel}).`);
  });

  profile.command("use <name>").description("Switch to a saved profile").action(async (name: string) => {
    const current = await ensureConfig();
    const saved = current.profiles?.[name];
    if (!saved) {
      console.log(`No profile named "${name}". Saved: ${Object.keys(current.profiles ?? {}).join(", ") || "(none)"}`);
      process.exitCode = 1;
      return;
    }
    saveConfig({ ...saved, profiles: current.profiles });
    console.log(`Switched to profile "${name}" (${saved.provider} · ${saved.defaultModel}).`);
  });

  profile.command("remove <name>").description("Delete a saved profile").action(async (name: string) => {
    const current = await ensureConfig();
    if (!current.profiles?.[name]) {
      console.log(`No profile named "${name}".`);
      process.exitCode = 1;
      return;
    }
    const profiles = { ...current.profiles };
    delete profiles[name];
    saveConfig({ ...current, profiles });
    console.log(`Profile "${name}" removed.`);
  });

  profile.command("list").description("List saved profiles").action(async () => {
    const current = await ensureConfig();
    const entries = Object.entries(current.profiles ?? {});
    if (entries.length === 0) {
      console.log("No profiles saved. Use `bajajbot profile save <name>`.");
      return;
    }
    for (const [name, saved] of entries) {
      console.log(`${name.padEnd(16)} ${saved.provider.padEnd(11)} ${saved.defaultModel}`);
    }
  });

  config.command("show").description("Show configuration").action(async () => {
    const { apiKey, ...config } = await ensureConfig();
    console.log(JSON.stringify({ ...config, apiKey: maskApiKey(apiKey) }, null, 2));
  });

  program
    .command("logout")
    .description("Remove all BajajBot data (config and sessions)")
    .action(async () => {
      const prompts = createInterface({ input, output });
      try {
        const answer = await prompts.question("Delete ~/.bajajbot (config + all sessions)? [y/N] ");
        if (answer.trim().toLowerCase() !== "y") {
          console.log("Aborted.");
          return;
        }
        console.log(removeConfig() ? "All BajajBot data removed." : "Nothing to remove.");
      } finally {
        prompts.close();
      }
    });
}

export async function initConfig(): Promise<Config | undefined> {
  if (!output.isTTY) return initConfigReadline();
  return await new Promise<Config | undefined>((resolve) => {
    let settled = false;
    const finish = (value: Config | undefined) => {
      if (settled) return;
      settled = true;
      if (value) saveConfig(value);
      resolve(value);
      instance.unmount();
    };
    const instance = render(createElement(SetupWizard, { onFinish: finish }), { exitOnCtrlC: false });
  });
}

async function ensureConfig(): Promise<Config> {
  if (configExists()) return loadConfig();
  const created = await initConfig();
  if (!created) throw new Error("Setup cancelled.");
  return created;
}

async function initConfigReadline(): Promise<Config | undefined> {
  const prompts = createInterface({ input, output });
  try {
    const choice = await prompts.question("Provider (1: OpenRouter, 2: custom): ");
    const provider: Config["provider"] = choice.trim() === "2" ? "custom" : "openrouter";
    const apiKey = await askRequired(prompts, "API key: ");
    const baseUrl = normalizeBaseUrl(await askUrl(prompts, "Base URL", provider === "openrouter" ? OPENROUTER_URL : undefined));
    const defaultModel = await askRequired(prompts, "Default model: ");
    const config: Config = { provider, apiKey, baseUrl, defaultModel };
    saveConfig(config);
    console.log("Config saved.");
    return config;
  } finally {
    prompts.close();
  }
}

async function askRequired(prompts: ReturnType<typeof createInterface>, question: string): Promise<string> {
  let value = "";
  while (!value.trim()) value = await prompts.question(question);
  return value.trim();
}

async function askUrl(
  prompts: ReturnType<typeof createInterface>,
  label: string,
  defaultValue?: string,
): Promise<string> {
  while (true) {
    const answer = await prompts.question(`${label}${defaultValue ? ` [${defaultValue}]` : ""}: `);
    const value = answer.trim() || defaultValue;
    try {
      if (!value) throw new Error("Required");
      return new URL(value).toString();
    } catch {
      console.log("Enter a valid URL.");
    }
  }
}
