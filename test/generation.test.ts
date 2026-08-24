import assert from "node:assert/strict";
import { test } from "node:test";
import { streamChat } from "../src/provider/client.js";
import type { Config } from "../src/config/types.js";

const base: Config = { provider: "openrouter", apiKey: "key", baseUrl: "https://x.test/v1", defaultModel: "m" };

async function captureBody(config: Config): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof fetch;
  for await (const _token of streamChat(config, [{ role: "user", content: "hi", timestamp: "t" }])) {
    // drain
  }
  assert.ok(captured);
  return captured;
}

test("streamChat sends temperature and max_tokens when configured", async () => {
  const body = await captureBody({ ...base, temperature: 0.3, maxTokens: 512 });
  assert.equal(body.temperature, 0.3);
  assert.equal(body.max_tokens, 512);
});

test("streamChat omits generation fields when unset", async () => {
  const body = await captureBody(base);
  assert.equal("temperature" in body, false);
  assert.equal("max_tokens" in body, false);
});
