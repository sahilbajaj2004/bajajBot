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
  return { role: message.role, content: message.content };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function* streamChat(config: Config, messages: Message[], options: StreamOptions = {}): AsyncGenerator<string> {
  const body: Record<string, unknown> = {
    model: config.defaultModel,
    messages: messages.map(toApiMessage),
    stream: true,
  };
  if (options.tools?.length) body.tools = options.tools;

  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
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

export async function completeChat(config: Config, messages: Message[]): Promise<string> {
  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.defaultModel, messages: messages.map(toApiMessage), stream: false }),
  });
  if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
  const content = (await response.json()).choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("API returned no assistant message.");
  return content;
}
