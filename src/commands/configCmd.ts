import type { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, saveConfig } from "../config/store.js";
import type { Config } from "../config/types.js";

const openRouterUrl = "https://openrouter.ai/api/v1";

function maskApiKey(apiKey: string): string {
  return apiKey.length <= 8 ? "********" : `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage BajajBot configuration");

  config.command("init").description("Create configuration").action(async () => {
    await initConfig();
  });

  config.command("set-model <id>").description("Change default model").action((defaultModel: string) => {
    const current = loadConfig();
    saveConfig({ ...current, defaultModel });
    console.log(`Default model: ${defaultModel}`);
  });

  config.command("show").description("Show configuration").action(() => {
    const { apiKey, ...config } = loadConfig();
    console.log(JSON.stringify({ ...config, apiKey: maskApiKey(apiKey) }, null, 2));
  });
}

export async function initConfig(): Promise<void> {
  const prompts = createInterface({ input, output });
  try {
    const choice = await prompts.question("Provider (1: OpenRouter, 2: custom): ");
    const provider: Config["provider"] = choice.trim() === "2" ? "custom" : "openrouter";
    const apiKey = await askRequired(prompts, "API key: ");
    const baseUrl = await askUrl(prompts, "Base URL", provider === "openrouter" ? openRouterUrl : undefined);
    const defaultModel = await askRequired(prompts, "Default model: ");
    saveConfig({ provider, apiKey, baseUrl: baseUrl.replace(/\/$/, ""), defaultModel });
    console.log("Config saved.");
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
