import type { Profile } from "../config/types.js";

export const OLLAMA_URL = "http://localhost:11434/v1";

export const OLLAMA_PROFILE_NAME = "ollama";

export interface OllamaResult {
  baseUrl: string;
  models: string[];
}

/**
 * Probe a local Ollama server's OpenAI-compatible endpoint. Resolves to the
 * detected models, or null when nothing answers (no server, wrong port, or a
 * non-Ollama service). The caller never throws.
 */
export async function ollamaProbe(baseUrl = OLLAMA_URL, timeoutMs = 2000): Promise<OllamaResult | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
    if (!Array.isArray(payload.data)) return null;
    const models = payload.data
      .map((entry) => (typeof entry?.id === "string" ? entry.id : ""))
      .filter((id): id is string => id.length > 0)
      .slice(0, 50);
    return models.length ? { baseUrl: `${baseUrl.replace(/\/$/, "")}/`, models } : null;
  } catch {
    return null;
  }
}

/**
 * Merge a detected Ollama result into the config profiles. Creates the
 * `ollama` profile on first sight (defaultModel = first installed model) but
 * never clobbers an existing one; the returned model is what to switch to.
 */
export function mergeOllamaProfiles(
  profiles: Record<string, Profile>,
  result: OllamaResult,
): { profiles: Record<string, Profile>; model: string; created: boolean } {
  const existing = profiles[OLLAMA_PROFILE_NAME];
  if (existing) return { profiles, model: existing.defaultModel, created: false };
  const defaultModel = result.models[0] ?? "";
  const created: Profile = {
    provider: "custom",
    apiKey: "",
    baseUrl: result.baseUrl,
    defaultModel,
  };
  return { profiles: { ...profiles, [OLLAMA_PROFILE_NAME]: created }, model: defaultModel, created: true };
}