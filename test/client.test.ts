import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { isAbortError, streamChat, type Usage } from "../src/provider/client.js";
import type { Config } from "../src/config/types.js";

const config: Config = { provider: "openrouter", apiKey: "key", baseUrl: "https://x.test/v1", defaultModel: "m" };

function sseBody(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`));
    },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const originalFetch = globalThis.fetch;

test("streamChat yields tokens and reports usage from the final chunk", async () => {
  const body = sseBody([
    'data: {"choices":[{"delta":{"content":"Hel"}}]}',
    'data: {"choices":[{"delta":{"content":"lo"}}]}',
    'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}',
    "data: [DONE]",
  ]);
  let capturedUsage: Usage | undefined;
  const tokens: string[] = [];
  globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
  for await (const token of streamChat(config, [], { onUsage: (usage) => (capturedUsage = usage) })) {
    tokens.push(token);
  }
  assert.deepEqual(tokens.join(""), "Hello");
  assert.equal(capturedUsage?.completion_tokens, 2);
});

test("streamChat throws with status and body text on API errors", async () => {
  globalThis.fetch = (async () => new Response("bad key", { status: 401 })) as typeof fetch;
  await assert.rejects(streamChat(config, []).next(), /API error 401: bad key/);
});

test("aborting the signal rejects the stream mid-flight", async () => {
  const controller = new AbortController();
  const encoder = new TextEncoder();
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  controller.signal.addEventListener("abort", () =>
    upstream.error(new DOMException("The operation was aborted.", "AbortError")),
  );
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      upstream = streamController;
      streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
    },
  });
  globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;

  const generator = streamChat(config, [], { signal: controller.signal });
  assert.equal((await generator.next()).value, "Hi");
  controller.abort();
  await assert.rejects(generator.next(), (error: unknown) => isAbortError(error));
});
