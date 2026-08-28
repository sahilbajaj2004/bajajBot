import type { Config } from "../config/types.js";
import type { Message, ToolCall } from "../session/types.js";
import type { ToolSchema } from "../tools/types.js";
import { normalizeBaseUrl } from "../util/url.js";

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface StreamOptions {
  signal?: AbortSignal;
  onUsage?: (usage: Usage) => void;
  tools?: ToolSchema[];
  onToolCalls?: (calls: ToolCall[]) => void;
  /** Progress notes while waiting out rate limits / server errors. */
  onStatus?: (message: string) => void;
  /** Backoff delays between retries; tests pass tiny values. */
  retryDelays?: number[];
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_RETRY_DELAYS = [2000, 5000, 12000];
const MAX_RETRY_AFTER_MS = 60_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = (): void => {
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort);
  });
}

/** Turn a raw API error response into something a terminal user can act on. */
export function friendlyApiError(status: number, body: string): string {
  let detail = body.trim().slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") detail = parsed.error.message.slice(0, 300);
  } catch {
    // body was not JSON — keep the raw text
  }
  switch (status) {
    case 401:
    case 403:
      return `API key rejected (${status}). Run \`bajajbot config init\` to fix your key.`;
    case 402:
      return `Provider account is out of credit (402). ${detail}`;
    case 404:
      return `Model or endpoint not found (404). Check the model ID with /model. ${detail}`;
    case 429:
      return `Rate limited by the provider (429). Free models allow only a few requests per minute/day — wait, or switch models with /model. ${detail}`;
    case 408:
    case 500:
    case 502:
    case 503:
    case 504:
      return `Provider is having trouble (${status}), even after retrying. ${detail}`;
    default:
      return `API error ${status}: ${detail}`;
  }
}

interface RequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * POST to /chat/completions with automatic retry on rate limits and server
 * errors (honoring Retry-After when provided). Throws friendlyApiError text.
 */
async function requestChatCompletions(
  config: Config,
  payload: Record<string, unknown>,
  options: { signal?: AbortSignal; onStatus?: (message: string) => void; retryDelays?: number[] } = {},
): Promise<Response> {
  const delays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
  const init: RequestInitLike = {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
        ...init,
        signal: options.signal,
      } as RequestInit);
    } catch (cause) {
      if (isAbortError(cause)) throw cause;
      throw fail(
        `Could not reach ${normalizeBaseUrl(config.baseUrl)} — check your connection. (${cause instanceof Error ? cause.message : String(cause)})`,
        true,
      );
    }
    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= delays.length) {
      if (!response.ok) {
        throw fail(friendlyApiError(response.status, await response.text()), RETRYABLE_STATUSES.has(response.status));
      }
      return response;
    }
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    await response.body?.cancel().catch(() => undefined);
    const delayMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS)
        : delays[attempt];
    const reason = response.status === 429 ? "rate limited" : `provider error ${response.status}`;
    options.onStatus?.(
      `⚠ ${reason} — retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${delays.length})`,
    );
    await sleep(delayMs, options.signal);
  }
}

interface Delta {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: Usage;
}

function toApiMessage(message: Message): Record<string, unknown> {
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.args },
      })),
    };
  }
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId ?? "", content: message.content };
  }
  if (message.contentParts?.length) {
    return { role: message.role, content: message.contentParts };
  }
  return { role: message.role, content: message.content };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** True for errors worth failing over to a fallback model: retryable HTTP
 *  statuses (429/5xx) that exhausted their backoff, or the provider being
 *  unreachable. False for bad keys, unknown models, and other 4xx errors. */
export function isRetryableError(error: unknown): boolean {
  return error instanceof Error && (error as { retryable?: boolean }).retryable === true;
}

function fail(message: string, retryable: boolean): Error {
  const error = new Error(message) as Error & { retryable?: boolean };
  if (retryable) error.retryable = true;
  return error;
}

export async function* streamChat(config: Config, messages: Message[], options: StreamOptions = {}): AsyncGenerator<string> {
  const body: Record<string, unknown> = {
    model: config.defaultModel,
    messages: messages.map(toApiMessage),
    stream: true,
  };
  if (typeof config.temperature === "number") body.temperature = config.temperature;
  if (typeof config.maxTokens === "number") body.max_tokens = config.maxTokens;
  if (options.tools?.length) body.tools = options.tools;

  const response = await requestChatCompletions(config, body, {
    signal: options.signal,
    onStatus: options.onStatus,
    retryDelays: options.retryDelays,
  });
  if (!response.body) throw new Error("API returned an empty response body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const pending = new Map<number, ToolCall>();

  const flushToolCalls = (): void => {
    if (pending.size === 0) return;
    const calls = [...pending.entries()].sort(([a], [b]) => a - b).map(([index, call]) => ({ ...call, id: call.id || `call_${index}` }));
    pending.clear();
    options.onToolCalls?.(calls);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        flushToolCalls();
        return;
      }
      let parsed: Delta;
      try {
        parsed = JSON.parse(data) as Delta;
      } catch {
        continue;
      }
      if (parsed.usage && typeof parsed.usage === "object") options.onUsage?.(parsed.usage);
      const delta = parsed.choices?.[0]?.delta;
      if (delta?.tool_calls?.length) {
        for (const fragment of delta.tool_calls) {
          const index = fragment.index ?? pending.size;
          const entry = pending.get(index) ?? { id: "", name: "", args: "" };
          entry.id += fragment.id ?? "";
          entry.name += fragment.function?.name ?? "";
          entry.args += fragment.function?.arguments ?? "";
          pending.set(index, entry);
        }
      }
      const token = delta?.content;
      if (typeof token === "string" && token.length > 0) {
        flushToolCalls();
        yield token;
      }
    }
  }
  flushToolCalls();
}

export async function completeChat(
  config: Config,
  messages: Message[],
  options: { signal?: AbortSignal; onStatus?: (message: string) => void; retryDelays?: number[] } = {},
): Promise<string> {
  const response = await requestChatCompletions(
    config,
    {
      model: config.defaultModel,
      messages: messages.map(toApiMessage),
      stream: false,
    },
    options,
  );
  const content = (await response.json()).choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("API returned no assistant message.");
  return content;
}
