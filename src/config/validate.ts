import { VERBOSITY_LEVELS } from "../ui/verbosity.js";

/** Required fields and the type each must have. */
const REQUIRED: Record<string, "string"> = {
  provider: "string",
  apiKey: "string",
  baseUrl: "string",
  defaultModel: "string",
};

/** Optional fields that must be numbers when present. */
const OPTIONAL_NUMBERS = [
  "temperature",
  "maxTokens",
  "contextTokens",
  "spendLimitUsd",
  "checkpointLimit",
] as const;

const PROVIDERS = ["openrouter", "custom"];

/**
 * Check a parsed config before it is trusted.
 *
 * `readConfigAt` used to cast whatever JSON it found, so a hand-edited config
 * (or one adopted by `/reload` mid-session) could carry `"provider": "custm"`
 * or `maxTokens: "lots"` and fail much later, somewhere unrelated. Returns the
 * problems found rather than throwing, so the caller decides how loud to be.
 */
export function configProblems(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["config is not a JSON object"];
  }
  const config = value as Record<string, unknown>;
  const problems: string[] = [];

  for (const [key, kind] of Object.entries(REQUIRED)) {
    const entry = config[key];
    if (typeof entry !== kind) problems.push(`${key} must be a ${kind}`);
    else if (kind === "string" && (entry as string).trim() === "") problems.push(`${key} must not be empty`);
  }

  if (typeof config.provider === "string" && !PROVIDERS.includes(config.provider)) {
    problems.push(`provider must be one of: ${PROVIDERS.join(", ")}`);
  }

  for (const key of OPTIONAL_NUMBERS) {
    const entry = config[key];
    if (entry === undefined) continue;
    if (typeof entry !== "number" || !Number.isFinite(entry)) problems.push(`${key} must be a number`);
  }

  if (config.verbosity !== undefined && !VERBOSITY_LEVELS.includes(config.verbosity as never)) {
    problems.push(`verbosity must be one of: ${VERBOSITY_LEVELS.join(", ")}`);
  }

  if (config.theme !== undefined && typeof config.theme !== "string") {
    problems.push("theme must be a string");
  }

  for (const key of ["favoriteModels", "fallbackModels"]) {
    const entry = config[key];
    if (entry === undefined) continue;
    if (!Array.isArray(entry) || entry.some((item) => typeof item !== "string")) {
      problems.push(`${key} must be an array of strings`);
    }
  }

  for (const key of ["routes", "snippets"]) {
    const entry = config[key];
    if (entry !== undefined && !Array.isArray(entry)) problems.push(`${key} must be an array`);
  }

  if (config.profiles !== undefined) {
    if (typeof config.profiles !== "object" || config.profiles === null || Array.isArray(config.profiles)) {
      problems.push("profiles must be an object");
    } else {
      for (const [name, profile] of Object.entries(config.profiles as Record<string, unknown>)) {
        if (typeof profile !== "object" || profile === null) {
          problems.push(`profiles.${name} must be an object`);
          continue;
        }
        const entry = profile as Record<string, unknown>;
        for (const key of ["provider", "apiKey", "baseUrl", "defaultModel"]) {
          if (typeof entry[key] !== "string") problems.push(`profiles.${name}.${key} must be a string`);
        }
      }
    }
  }

  return problems;
}

/** A single line naming every problem, or null when the config is sound. */
export function describeProblems(problems: string[]): string | null {
  if (problems.length === 0) return null;
  const shown = problems.slice(0, 3).join("; ");
  const rest = problems.length - Math.min(problems.length, 3);
  return `${shown}${rest > 0 ? ` (+${rest} more)` : ""}`;
}
