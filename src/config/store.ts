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
  return readConfigAt(configPath());
}

export function readConfigAt(path: string): Config {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Config file ${path} is corrupted (${reason}). Fix or delete it, then run \`bajajbot config init\`.`);
  }
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
