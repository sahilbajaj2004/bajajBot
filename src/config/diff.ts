import type { Config } from "./types.js";

/** Config fields worth naming in a change report, in a stable reading order. */
const REPORTED_ORDER = [
  "provider",
  "baseUrl",
  "defaultModel",
  "theme",
  "temperature",
  "maxTokens",
  "contextTokens",
  "spendLimitUsd",
  "checkpointLimit",
  "systemPrompt",
  "favoriteModels",
  "fallbackModels",
  "routes",
  "snippets",
  "profiles",
  "webSearch",
  "apiKey",
] as const;

/** True when two values differ, comparing arrays and objects structurally. */
function differs(before: unknown, after: unknown): boolean {
  if (before === after) return false;
  if (before === undefined || after === undefined) {
    // A key appearing or disappearing is only a change if it carries a value.
    return (before ?? null) !== (after ?? null);
  }
  if (typeof before !== "object" || typeof after !== "object" || before === null || after === null) {
    return before !== after;
  }
  return JSON.stringify(before) !== JSON.stringify(after);
}

/**
 * Which top-level config keys differ between two configs, named in a stable
 * order. Only key *names* come back - values (least of all an API key) are the
 * user's to look at in the file.
 */
export function changedConfigKeys(before: Config, after: Config): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    const record = before as unknown as Record<string, unknown>;
    const next = after as unknown as Record<string, unknown>;
    if (differs(record[key], next[key])) changed.push(key);
  }
  const ordered = REPORTED_ORDER.filter((key) => changed.includes(key));
  const rest = changed.filter((key) => !REPORTED_ORDER.includes(key as (typeof REPORTED_ORDER)[number])).sort();
  return [...ordered, ...rest];
}

/**
 * A one-line summary of a reload, sized for the status bar. `marker` is a short
 * parenthetical - the status bar is narrow, and a path or a long key list would
 * truncate away exactly the part the user needs to read.
 */
export function describeReload(before: Config, after: Config, marker?: string): string {
  const tag = marker ? ` ${marker}` : "";
  const changed = changedConfigKeys(before, after);
  if (changed.length === 0) return `✓ reloaded${tag} - no changes`;
  const shown = changed.slice(0, 2).join(", ");
  const rest = changed.length - Math.min(changed.length, 2);
  const tail = rest > 0 ? ` +${rest} more` : "";
  return `✓ reloaded${tag} - ${changed.length} changed: ${shown}${tail}`;
}

/** True when the two configs describe a different upstream to talk to. */
export function providerIdentityChanged(before: Config, after: Config): boolean {
  return (
    before.provider !== after.provider ||
    before.baseUrl !== after.baseUrl ||
    before.apiKey !== after.apiKey
  );
}
