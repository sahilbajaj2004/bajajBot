import assert from "node:assert/strict";
import test from "node:test";
import { completeChat, streamChat } from "../src/provider/client.js";

const config = {
  provider: "openrouter" as const,
  apiKey: "test-key",
  baseUrl: "https://example.test/v1/",
  defaultModel: "test-model",
};

test("streams SSE content across partial chunks", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(streamFrom([
    'data: {"choices":[{"delta":{"content":"Hel',
    'lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n',
    "data: [DONE]\n",
  ]));

  try {
    const tokens: string[] = [];
    for await (const token of streamChat(config, [{ role: "user", content: "Hi", timestamp: "" }])) tokens.push(token);
    assert.deepEqual(tokens, ["Hello", " world"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("includes API response body in failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Bad key", { status: 401 });

  try {
    await assert.rejects(streamChat(config, []).next(), /API error 401: Bad key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gets a complete non-streamed reply", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.match(String(options?.body), /"stream":false/);
    return new Response(JSON.stringify({ choices: [{ message: { content: "Hello" } }] }));
  };
  try {
    assert.equal(await completeChat(config, []), "Hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}
