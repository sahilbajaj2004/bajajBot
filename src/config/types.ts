export interface Profile {
  provider: Config["provider"];
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

export interface RouteRule {
  /** Case-insensitive substring, or `/.../ `-wrapped regex matched against the user message. */
  pattern: string;
  /** Model ID or `profile:<name>`. */
  model: string;
  /** Disabled rules are skipped when matching. Default true. */
  active?: boolean;
  /** Short label for the status hint; defaults to the matched model. */
  label?: string;
}

export interface Snippet {
  name: string;
  text: string;
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
  /**
   * Ordered auto-failover chain: on a rate limit (429), server error (5xx) or
   * unreachable provider, the turn retries on each entry in turn. Entries are
   * model IDs (same provider) or `profile:<name>` to use a saved profile
   * (e.g. a local Ollama). Empty/unset disables failover.
   */
  fallbackModels?: string[];
  /**
   * Smart-routing rules: the first active rule whose pattern matches the
   * user's message picks the model for that turn (only). `pattern` is a
   * case-insensitive substring, or a `/.../ `-wrapped regex. `model` is a
   * model ID or `profile:<name>`. Maintained with `/route`.
   */
  routes?: RouteRule[];
  /**
   * Named prompt templates. `/sn <name>` inserts a snippet's text into the
   * input box; `/sn save <name>` stores your last sent message. Managed with
   * the `/sn` picker.
   */
  snippets?: Snippet[];
  /** Web search backend for the agent's web_search tool. Default: duckduckgo (no key). */
  webSearch?: {
    provider: "duckduckgo" | "brave" | "tavily" | "searxng";
    apiKey?: string;
    searxUrl?: string;
  };
}
