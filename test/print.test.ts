import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { runPrintTurn } from "../src/commands/printCmd.js";
import type { Config } from "../src/config/types.js";

const config: Config = { provider: "openrouter", apiKey: "k", baseUrl: "https://x.test/v1", defaultModel: "m" };

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function sse(lines: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`));
      },
    }),
    { status: 200 },
  );
}

test("runPrintTurn streams and returns the full answer without tool calls", async () => {
  globalThis.fetch = (async () =>
    sse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo world"}}]}',
      "data: [DONE]",
    ])) as typeof fetch;

  let streamed = "";
  let capturedBody = "";
  const { reply, denied } = await runPrintTurn(config, "say hi", {
    onToken: (token) => (streamed += token),
  });
  void capturedBody;
  assert.equal(reply, "Hello world");
  assert.equal(streamed, "Hello world");
  assert.deepEqual(denied, []);
});

test("runPrintTurn runs safe tools across rounds but denies risky ones by default", async () => {
  let round = 0;
  let capturedBody = "";
  globalThis.fetch = (async (_url, init) => {
    capturedBody = String(init?.body ?? "");
    round++;
    if (round === 1) {
      return sse(['data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"list_dir","arguments":"{}"}}]}}]}', "data: [DONE]"]);
    }
    return sse([`data: {"choices":[{"delta":{"content":"listing done after ${round - 1} tools"}}]}`, "data: [DONE]"]);
  }) as typeof fetch;

  const { reply, denied } = await runPrintTurn({ ...config, apiKey: "k" }, "list files");
  assert.match(reply, /listing done/);
  assert.deepEqual(denied, []);
  const parsed = JSON.parse(capturedBody) as { messages: Array<{ role: string; content?: string }> };
  assert.equal(parsed.messages[0].role, "system");

  let offeredCall = false;
  globalThis.fetch = (async () => {
    if (!offeredCall) {
      offeredCall = true;
      return sse(['data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c2","function":{"name":"write_file","arguments":"{\\"path\\":\\"x.txt\\",\\"content\\":\\"hi\\"}"}}]}}]}', "data: [DONE]"]);
    }
    return sse(["data: [DONE]"]);
  }) as typeof fetch;
  const blocked = await runPrintTurn(config, "write a file");
  assert.equal(blocked.reply, "");
  assert.equal(blocked.denied.length, 1);
  assert.match(blocked.denied[0], /^write_file/);
});

test("runPrintTurn surfaces API errors for the CLI to print", async () => {
  globalThis.fetch = (async () => new Response("bad key", { status: 401 })) as typeof fetch;
  await assert.rejects(runPrintTurn(config, "hi"), /API key rejected \(401\)/);
});
