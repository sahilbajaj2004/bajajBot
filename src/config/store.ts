import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { writeFileAtomic } from "../util/atomicWrite.js";
import { configProblems, describeProblems } from "./validate.js";
import { APP_DIR_NAME } from "./constants.js";
import type { Config } from "./types.js";

export const appDir = () => join(homedir(), APP_DIR_NAME);

/** Env var that points the config somewhere other than the app dir. */
export const CONFIG_ENV_VAR = "BAJAJBOT_CONFIG";

/**
 * Where the config lives. `BAJAJBOT_CONFIG` wins, which lets one install serve
 * several configs (per-project settings, a scratch file to try a model out)
 * without touching the real one.
 *
 * Everything else - sessions, tabs, schedules - stays in the app dir; only the
 * config file moves.
 */
export function configPath(): string {
  const override = process.env[CONFIG_ENV_VAR]?.trim();
  return override ? resolve(override) : join(appDir(), "config.json");
}

/** True when the config is being read from a BAJAJBOT_CONFIG override. */
export function configIsOverridden(): boolean {
  return Boolean(process.env[CONFIG_ENV_VAR]?.trim());
}

export function configExists(): boolean {
  return existsSync(configPath());
}

export function loadConfig(): Config {
  if (!configExists()) throw new Error("Config missing. Run `bajajbot config init`.");
  return readConfigAt(configPath());
}

export function readConfigAt(path: string): Config {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Config file ${path} is corrupted (${reason}). Fix or delete it, then run \`bajajbot config init\`.`);
  }
  // Valid JSON is not a valid config: catching a bad provider or a string where
  // a number belongs here beats failing later, somewhere unrelated.
  const problems = describeProblems(configProblems(parsed));
  if (problems) {
    throw new Error(`Config file ${path} is not usable (${problems}). Fix or delete it, then run \`bajajbot config init\`.`);
  }
  return parsed as Config;
}

export function saveConfig(config: Config): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  // Atomic, so a crash mid-write cannot leave a config that no longer parses -
  // that would lock you out of the key needed to fix it.
  writeFileAtomic(path, `${JSON.stringify(config, null, 2)}\n`, 0o600);
}

export function removeConfig(): boolean {
  // With an override in play the app dir is not ours to delete - sessions and
  // history live there and have nothing to do with the config being replaced.
  if (configIsOverridden()) {
    const path = configPath();
    if (!existsSync(path)) return false;
    rmSync(path, { force: true });
    return true;
  }
  if (!existsSync(appDir())) return false;
  rmSync(appDir(), { recursive: true, force: true });
  return true;
}
