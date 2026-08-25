import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appDir } from "../config/store.js";

const REGISTRY_URL = "https://registry.npmjs.org/bajajbot/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const markerPath = () => join(appDir(), "last-update-check");

/** Compare dotted versions numerically; ignores prerelease suffixes. */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (value: string): number[] =>
    value.split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(current);
  const b = parse(latest);
  for (let i = 0; i < 3; i++) {
    if ((b[i] ?? 0) > (a[i] ?? 0)) return true;
    if ((b[i] ?? 0) < (a[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Ask npm whether a newer bajajbot exists — at most once every 24h, and only
 * when online. Returns the newer version string, or null (up to date,
 * offline, checked recently, or any failure). Never throws.
 */
export async function checkForUpdate(
  currentVersion: string,
  options: { markerFile?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  const marker = options.markerFile ?? markerPath();
  try {
    if (existsSync(marker) && Date.now() - statMtimeMs(marker) < CHECK_INTERVAL_MS) return null;
    const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(options.timeoutMs ?? 4000) });
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: unknown };
    const latest = typeof data.version === "string" ? data.version : "";
    if (!latest || !isNewerVersion(currentVersion, latest)) return null;
    try {
      writeFileSync(marker, `${new Date().toISOString()} latest=${latest}\n`);
    } catch {
      // marker is best-effort
    }
    return latest;
  } catch {
    return null;
  }
}

function statMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}
