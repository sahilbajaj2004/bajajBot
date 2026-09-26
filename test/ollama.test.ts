import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, test } from "node:test";
import { mergeOllamaProfiles, OLLAMA_PROFILE_NAME, ollamaProbe } from "../src/tools/ollama.js";
import type { Profile } from "../src/config/types.js";
import type { AddressInfo } from "node:net";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  servers.length = 0;
});

async function listen(handler: (url: string | undefined) => { status: number; body: unknown }): Promise<string> {
  const server = createServer((req, res) => {
    const outcome = handler(req.url);
    res.writeHead(outcome.status, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify(outcome.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
}

test("ollamaProbe resolves model ids from the OpenAI-compatible /models endpoint", async () => {
  const base = await listen((url) => {
    assert.equal(url, "/v1/models");
    return { status: 200, body: { object: "list", data: [{ id: "llama3.2" }, { id: "deepseek-coder" }, { id: 7 }] } };
  });
  const found = await ollamaProbe(base, 1000);
  assert.deepEqual(found, { baseUrl: `${base}/`, models: ["llama3.2", "deepseek-coder"] });
});

test("ollamaProbe returns null for non-Ollama services and down ports", async () => {
  const base = await listen(() => ({ status: 500, body: {} }));
  assert.equal(await ollamaProbe(base, 1000), null);
  assert.equal(await ollamaProbe("http://127.0.0.1:1/v1", 500), null);
});

test("mergeOllamaProfiles creates the profile once and never clobbers it", () => {
  const result = { baseUrl: "http://localhost:11434/v1/", models: ["llama3.2", "gpt-oss:latest"] };
  const first = mergeOllamaProfiles({}, result);
  assert.equal(first.created, true);
  assert.equal(first.model, "llama3.2");
  assert.deepEqual(first.profiles[OLLAMA_PROFILE_NAME], {
    provider: "custom",
    apiKey: "",
    baseUrl: "http://localhost:11434/v1/",
    defaultModel: "llama3.2",
  });

  const keeper: Profile = { provider: "custom", apiKey: "", baseUrl: "http://localhost:11434/v1/", defaultModel: "llama3.2" };
  const second = mergeOllamaProfiles(first.profiles, result);
  assert.equal(second.created, false);
  assert.equal(second.model, "llama3.2");
  assert.deepEqual(second.profiles[OLLAMA_PROFILE_NAME], keeper);
});