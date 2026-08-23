export interface ModelInfo {
  id: string;
  name?: string;
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`API error ${response.status}: could not list models`);
  const data = (await response.json()) as { data?: ModelInfo[] };
  return Array.isArray(data.data) ? data.data.filter((model) => typeof model?.id === "string") : [];
}
