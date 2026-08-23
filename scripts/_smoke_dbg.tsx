import { createServer } from "node:http";
import { createElement } from "react";
import { render } from "ink";
import { App } from "../src/ui/App.js";
import type { Config } from "../src/config/types.js";
import type { Session } from "../src/session/types.js";

const sse = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
let n = 0;
const server = createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => (raw += chunk));
  request.on("end", () => {
    n += 1;
    response.setHeader("content-type", "text/event-stream");
    const lines = Array.from({ length: 40 }, (_, i) => `answer ${n} line ${i + 1}`).join("\n");
    for (const part of lines.match(/.{1,60}/g) ?? []) {
      response.write(sse({ choices: [{ delta: { content: part } }] }));
    }
    response.write("data: [DONE]\n\n");
    response.end();
  });
});
await new Promise<void>((resolve) => server.listen(8794, "127.0.0.1", resolve));
const now = new Date().toISOString();
const config: Config = { provider: "custom", apiKey: "k", baseUrl: "http://127.0.0.1:8794/v1", defaultModel: "mock/x" };
const session: Session = { id: `chat-dbg-${Date.now()}`, createdAt: now, updatedAt: now, model: "mock/x", messages: [] };

function Probe() {
  return null;
}
render(createElement(App, { config, session }));
