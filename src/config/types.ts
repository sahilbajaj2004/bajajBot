export interface Profile {
  provider: Config["provider"];
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

export interface Config {
  provider: "openrouter" | "custom";
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  /** Optional generation overrides. */
  temperature?: number;
  maxTokens?: number;
  /** Replace the built-in system prompt entirely when set. */
  systemPrompt?: string;
  /** Estimated token budget before older history is auto-summarized. Default 12000. */
  contextTokens?: number;
  /** Warn once per session when accumulated cost crosses this many USD. */
  spendLimitUsd?: number;
  /** Model IDs pinned to the top of the /model picker. */
  favoriteModels?: string[];
  /** Saved provider profiles, switchable with /profile or `bajajbot profile use`. */
  profiles?: Record<string, Profile>;
}
