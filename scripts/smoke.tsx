import { createServer } from "node:http";
import { createElement } from "react";
import { render } from "ink";
import { App } from "../src/ui/App.js";
import type { Config } from "../src/config/types.js";
import type { Session } from "../src/session/types.js";

const sse = (payload: string) => `data: ${JSON.stringify(payload)}\n\n`;
const modelIds = ["mock/small", "mock/large", ...Array.from({ length: 30 }, (_, i) => `mock/model-${String(i + 1).padStart(2, "0")}`)];

let lastModel = "";

const server = createServer((request, response) => {
  if (request.url?.endsWith("/models")) {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: modelIds.map((id) => ({ id })) }));
    return;
  }
  if (request.url?.endsWith("/lastmodel")) {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ model: lastModel }));
    return;
  }
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    try {
      lastModel = JSON.parse(raw).model ?? "";
    } catch {
      lastModel = "";
    }
    response.setHeader("content-type", "text/event-stream");
    response.write(sse({ choices: [{ delta: { content: "Hel" } }] }));
    setTimeout(() => {
      response.write(sse({ choices: [{ delta: { content: "**lo**" } }] }));
      response.write(sse({ choices: [{ delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 2 } }));
      response.write("data: [DONE]\n\n");
      response.end();
    }, 300);
  });
});

await new Promise<void>((resolve) => server.listen(8787, "127.0.0.1", resolve));

const now = new Date().toISOString();
const filler = Array.from({ length: 40 }, (_, i) => [
  { role: "user" as const, content: `filler question ${i + 1}`, timestamp: now },
  { role: "assistant" as const, content: `filler answer ${i + 1} with some text to occupy scrollback space`, timestamp: now },
]).flat();

const session: Session = {
  id: "chat-smoke",
  createdAt: now,
  updatedAt: now,
  model: "mock/small",
  messages: filler,
};

const config: Config = {
  provider: "custom",
  apiKey: "test-key",
  baseUrl: "http://127.0.0.1:8787/v1",
  defaultModel: "mock/small",
};

const app = render(createElement(App, { config, session }));
setTimeout(() => process.exit(0), 20000);
process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
