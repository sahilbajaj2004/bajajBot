import type { Command } from "commander";
import { render } from "ink";
import { createElement } from "react";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { configExists, loadConfig, saveConfig, removeConfig } from "../config/store.js";
import type { Config } from "../config/types.js";
import { SetupWizard } from "../ui/Setup.js";

const openRouterUrl = "https://openrouter.ai/api/v1";

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
    const baseUrl = await askUrl(prompts, "Base URL", provider === "openrouter" ? openRouterUrl : undefined);
    const defaultModel = await askRequired(prompts, "Default model: ");
    saveConfig({ provider, apiKey, baseUrl: baseUrl.replace(/\/$/, ""), defaultModel });
    console.log("Config saved.");
    return { provider, apiKey, baseUrl: baseUrl.replace(/\/$/, ""), defaultModel };
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
