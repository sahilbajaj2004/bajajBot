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

test("streamChat accumulates fragmented tool_calls and reports them once", async () => {
  const body = sseBody([
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_","arguments":""}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"file","arguments":"{\\"path\\""}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"a.ts\\"}"}}]}}]}',
    "data: [DONE]",
  ]);
  const tokens: string[] = [];
  const seen: unknown[] = [];
  let capturedBody = "";
  globalThis.fetch = (async (_url, init) => {
    capturedBody = String(init?.body ?? "");
    return new Response(body, { status: 200 });
  }) as typeof fetch;

  for await (const token of streamChat(config, [], {
    tools: [{ type: "function", function: { name: "read_file", description: "", parameters: {} } }],
    onToolCalls: (calls) => seen.push(calls),
  })) {
    tokens.push(token);
  }

  assert.equal(tokens.join(""), "");
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], [{ id: "call_1", name: "read_file", args: '{"path":"a.ts"}' }]);
  assert.match(capturedBody, /"tools":\[/);
});

test("assistant tool_calls and tool results round-trip through the API payload", async () => {
  const tokens: string[] = [];
  let capturedBody = "";
  const body = sseBody(['data: {"choices":[{"delta":{"content":"ok"}}]}', "data: [DONE]"]);
  globalThis.fetch = (async (_url, init) => {
    capturedBody = String(init?.body ?? "");
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  for await (const token of streamChat(config, [
    {
      role: "assistant",
      content: "",
      timestamp: now(),
      toolCalls: [{ id: "call_9", name: "run_command", args: '{"command":"ls"}' }],
    },
    { role: "tool", content: "file1\n", timestamp: now(), toolCallId: "call_9" },
  ])) {
    tokens.push(token);
  }
  const parsed = JSON.parse(capturedBody) as { messages: Array<Record<string, unknown>> };
  assert.deepEqual(parsed.messages[0], {
    role: "assistant",
    content: null,
    tool_calls: [{ id: "call_9", type: "function", function: { name: "run_command", arguments: '{"command":"ls"}' } }],
  });
  assert.deepEqual(parsed.messages[1], { role: "tool", tool_call_id: "call_9", content: "file1\n" });
});

function now(): string {
  return new Date(0).toISOString();
}
