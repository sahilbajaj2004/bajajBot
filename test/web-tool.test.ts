import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { executeTool } from "../src/tools/index.js";
import type { ToolContext } from "../src/tools/types.js";

const originalFetch = globalThis.fetch;
const ctx: ToolContext = { cwd: "/tmp", confirm: async () => true };

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetch_url returns status, content type and body", async () => {
  globalThis.fetch = (async () =>
    new Response("<h1>hello</h1>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  const output = await executeTool({ name: "fetch_url", args: JSON.stringify({ url: "https://example.test" }) }, ctx);
  assert.ok(output.startsWith("HTTP 200 · text/html"));
  assert.ok(output.includes("<h1>hello</h1>"));
});

test("fetch_url rejects non-http URLs and missing url", async () => {
  const bad = await executeTool({ name: "fetch_url", args: JSON.stringify({ url: "ftp://x" }) }, ctx);
  assert.ok(bad.startsWith("Error:"));
  const missing = await executeTool({ name: "fetch_url", args: "{}" }, ctx);
  assert.ok(missing.startsWith("Error:"));
});

test("fetch_url truncates large bodies", async () => {
  globalThis.fetch = (async () => new Response("x".repeat(50_000))) as typeof fetch;
  const output = await executeTool({ name: "fetch_url", args: JSON.stringify({ url: "https://example.test/big" }) }, ctx);
  assert.ok(output.includes("… truncated (50000 chars total)"));
});

test("fetch_url is registered and requires confirmation", async () => {
  let asked = false;
  globalThis.fetch = (async () => new Response("ok")) as typeof fetch;
  const output = await executeTool(
    { name: "fetch_url", args: JSON.stringify({ url: "https://example.test" }) },
    { cwd: "/tmp", confirm: async () => (asked = true) || true },
  );
  assert.ok(output.includes("HTTP 200"));
  assert.equal(asked, true);
});
