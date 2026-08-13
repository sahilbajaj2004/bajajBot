export interface Config {
  provider: "openrouter" | "custom";
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}
