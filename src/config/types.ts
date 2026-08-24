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
  /** Saved provider profiles, switchable with /profile or `bajajbot profile use`. */
  profiles?: Record<string, Profile>;
}
