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
  await assert.rejects(streamChat(config, []).next(), /API key rejected \(401\)/);
});

test("streamChat retries 429s and succeeds on a later attempt", async () => {
  let calls = 0;
  const statuses = [429, 429, 200];
  globalThis.fetch = (async () => {
    const status = statuses[Math.min(calls++, statuses.length - 1)];
    return status === 200
      ? new Response(sseBody(['data: {"choices":[{"delta":{"content":"ok"}}]}', "data: [DONE]"]), { status })
      : new Response('{"error":{"message":"Rate limit exceeded"}}', { status });
  }) as typeof fetch;
  const notes: string[] = [];
  const tokens: string[] = [];
  for await (const token of streamChat(config, [], { retryDelays: [1, 1], onStatus: (note) => notes.push(note) })) {
    tokens.push(token);
  }
  assert.equal(tokens.join(""), "ok");
  assert.equal(calls, 3);
  assert.match(notes[0], /rate limited — retrying in 0s \(attempt 1\/2\)/);
});

test("streamChat gives up after exhausting retries with a friendly message", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response('{"error":{"message":"Too many requests"}}', { status: 429 });
  }) as typeof fetch;
  await assert.rejects(
    streamChat(config, [], { retryDelays: [1] }).next(),
    /Rate limited by the provider \(429\).*Too many requests/s,
  );
  assert.equal(calls, 2);
});

test("streamChat honors Retry-After seconds over the default backoff", async () => {
  let calls = 0;
  const startedAt = Date.now();
  globalThis.fetch = (async () => {
    calls++;
    return calls === 1
      ? new Response("slow down", { status: 429, headers: { "Retry-After": "1" } })
      : new Response(sseBody(["data: [DONE]"]), { status: 200 });
  }) as typeof fetch;
  for await (const _token of streamChat(config, [], { retryDelays: [60000] })) break;
  assert.ok(Date.now() - startedAt >= 900);
  assert.equal(calls, 2);
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
