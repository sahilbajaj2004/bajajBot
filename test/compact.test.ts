import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { compactionCut, compactMessages, estimateTokens } from "../src/session/compact.js";
import type { Config } from "../src/config/types.js";
import type { Message } from "../src/session/types.js";

const config: Config = { provider: "openrouter", apiKey: "k", baseUrl: "https://x.test/v1", defaultModel: "m" };
const stamp = "2026-01-01T00:00:00.000Z";

function mk(role: Message["role"], content: string): Message {
  return { role, content, timestamp: stamp };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("estimateTokens approximates chars/4 across messages", () => {
  const messages = [mk("user", "x".repeat(100)), mk("assistant", "y".repeat(301))];
  assert.equal(estimateTokens(messages), Math.ceil((100 + 301) / 4));
});

test("compactionCut only splits before user messages and keeps recent turns", () => {
  const chat = [
    mk("user", "q1"),
    mk("assistant", "a1"),
    mk("assistant", "with tools"),
    mk("tool", "result"),
    mk("user", "q2"),
    mk("assistant", "a2"),
    mk("tool", "tail"),
  ];
  assert.equal(compactionCut(chat, 8), null);
  assert.equal(compactionCut(chat, 3), 4);
  assert.equal(compactionCut(chat, 2), null);
  assert.equal(compactionCut(chat, 1), null);
  assert.equal(compactionCut(chat, 0), null);

  const endingOnUser = [mk("user", "q1"), mk("assistant", "a1"), mk("user", "q2")];
  assert.equal(compactionCut(endingOnUser, 2), 2);
});

test("compactMessages skips small histories entirely", async () => {
  const small = [mk("user", "hi"), mk("assistant", "hello")];
  assert.equal(await compactMessages(config, small), null);
});

test("compactMessages summarizes old turns and keeps the recent ones verbatim", async () => {
  let captured = "";
  globalThis.fetch = (async (_url, init) => {
    captured = String(init?.body ?? "");
    return new Response(JSON.stringify({ choices: [{ message: { content: "  User wants X. Files: a.ts.  " } }] }), { status: 200 });
  }) as typeof fetch;

  const big: Message[] = [];
  for (let round = 0; round < 30; round++) big.push(mk("user", `question ${round} ${"pad".repeat(150)}`), mk("assistant", `answer ${round}`));
  big.push(mk("user", "latest question"), mk("assistant", "latest answer"));

  const result = await compactMessages({ ...config, contextTokens: 2000 }, big);
  assert.ok(result);
  assert.equal(result.removed, big.length - 8);
  assert.ok(result.messages[0].content.includes("[Earlier conversation summarized"));
  assert.ok(result.messages[0].content.includes("User wants X"));
  assert.equal(result.messages.at(-1)?.content, "latest answer");
  assert.equal(result.messages.length, 9);
  assert.match(captured, /question 0/);
  assert.doesNotMatch(captured, /latest question/);
});

test("compactMessages keeps full history when summarization fails", async () => {
  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  const big: Message[] = [];
  for (let round = 0; round < 20; round++) big.push(mk("user", `q ${round} ${"z".repeat(400)}`), mk("assistant", "a"));
  const result = await compactMessages({ ...config, contextTokens: 1500 }, big, { retryDelays: [1] });
  assert.equal(result, null);
});
