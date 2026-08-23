import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { APP_DIR_NAME } from "./constants.js";
import type { Config } from "./types.js";

export const appDir = () => join(homedir(), APP_DIR_NAME);
const configPath = () => join(appDir(), "config.json");

export function configExists(): boolean {
  return existsSync(configPath());
}

export function loadConfig(): Config {
  if (!configExists()) throw new Error("Config missing. Run `bajajbot config init`.");
  return JSON.parse(readFileSync(configPath(), "utf8")) as Config;
}

export function saveConfig(config: Config): void {
  mkdirSync(join(appDir(), "sessions"), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function removeConfig(): boolean {
  if (!existsSync(appDir())) return false;
  rmSync(appDir(), { recursive: true, force: true });
  return true;
}
