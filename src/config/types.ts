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
  /** Max git checkpoints kept per project (oldest pruned). Default 200. */
  checkpointLimit?: number;
  /** UI colorway name; see /theme in chat or `config set theme`. */
  theme?: string;
  /** Saved provider profiles, switchable with /profile or `bajajbot profile use`. */
  profiles?: Record<string, Profile>;
  /** Web search backend for the agent's web_search tool. Default: duckduckgo (no key). */
  webSearch?: {
    provider: "duckduckgo" | "brave" | "tavily" | "searxng";
    apiKey?: string;
    searxUrl?: string;
  };
}
