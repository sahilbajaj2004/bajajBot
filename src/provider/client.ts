import type { Config } from "../config/types.js";
import type { Message } from "../session/types.js";

export async function* streamChat(config: Config, messages: Message[]): AsyncGenerator<string> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.defaultModel,
      messages: messages.map(({ role, content }) => ({ role, content })),
      stream: true,
    }),
  });

  if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
  if (!response.body) throw new Error("API returned an empty response body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      const token = JSON.parse(data).choices?.[0]?.delta?.content;
      if (typeof token === "string") yield token;
    }
  }
}

export async function completeChat(config: Config, messages: Message[]): Promise<string> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.defaultModel,
      messages: messages.map(({ role, content }) => ({ role, content })),
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
  const content = (await response.json()).choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("API returned no assistant message.");
  return content;
}
