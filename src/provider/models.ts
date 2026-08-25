import { normalizeBaseUrl } from "../util/url.js";

export interface ModelPricing {
  prompt?: string;
  completion?: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
  pricing?: ModelPricing;
}

const MODEL_CACHE_TTL_MS = 5 * 60_000;
const modelCache = new Map<string, { at: number; list: ModelInfo[] }>();

export function clearModelCache(): void {
  modelCache.clear();
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  const key = `${normalizeBaseUrl(baseUrl)}::${apiKey ? "auth" : "anon"}`;
  const cached = modelCache.get(key);
  if (cached && Date.now() - cached.at < MODEL_CACHE_TTL_MS) return cached.list;
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`API error ${response.status}: could not list models`);
  const data = (await response.json()) as { data?: ModelInfo[] };
  const list = Array.isArray(data.data) ? data.data.filter((model) => typeof model?.id === "string") : [];
  modelCache.set(key, { at: Date.now(), list });
  return list;
}

/** USD cost for a reply, from OpenRouter-style per-token pricing strings. */
export function estimateCost(model: ModelInfo | undefined, promptTokens: number, completionTokens: number): number | null {
  const prompt = Number(model?.pricing?.prompt);
  const completion = Number(model?.pricing?.completion);
  if (!Number.isFinite(prompt) && !Number.isFinite(completion)) return null;
  return (Number.isFinite(prompt) ? prompt * promptTokens : 0) + (Number.isFinite(completion) ? completion * completionTokens : 0);
}

/**
 * Sort models with the user's favorites first (in pin order, including IDs
 * missing from the endpoint list), everything else alphabetical after.
 */
export function orderModels(models: ModelInfo[], favorites: string[] = []): Array<{ id: string; name?: string; pricing?: ModelPricing; favorite: boolean }> {
  const pinned = favorites.map((id) => ({ id, model: models.find((entry) => entry.id.toLowerCase() === id.toLowerCase()) }));
  const rest = models.filter((entry) => !favorites.some((favorite) => favorite.toLowerCase() === entry.id.toLowerCase()));
  const rows = [
    ...pinned.map(({ id, model }) => ({ id: model?.id ?? id, name: model?.name, pricing: model?.pricing, favorite: true })),
    ...rest.map((entry) => ({ id: entry.id, name: entry.name, pricing: entry.pricing, favorite: false })).sort((a, b) => a.id.localeCompare(b.id)),
  ];
  return rows;
}
