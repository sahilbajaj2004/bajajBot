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

export async function fetchModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`API error ${response.status}: could not list models`);
  const data = (await response.json()) as { data?: ModelInfo[] };
  return Array.isArray(data.data) ? data.data.filter((model) => typeof model?.id === "string") : [];
}

/** USD cost for a reply, from OpenRouter-style per-token pricing strings. */
export function estimateCost(model: ModelInfo | undefined, promptTokens: number, completionTokens: number): number | null {
  const prompt = Number(model?.pricing?.prompt);
  const completion = Number(model?.pricing?.completion);
  if (!Number.isFinite(prompt) && !Number.isFinite(completion)) return null;
  return (Number.isFinite(prompt) ? prompt * promptTokens : 0) + (Number.isFinite(completion) ? completion * completionTokens : 0);
}
