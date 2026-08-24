import type { ToolArgs, ToolDef } from "./types.js";

const MAX_FETCH = 20_000;

export const fetchUrl: ToolDef = {
  name: "fetch_url",
  description: "Fetch a web page or API endpoint over HTTP(S) and return the response body (HTML/text/JSON, truncated).",
  risky: true,
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Absolute http(s) URL to fetch" },
      method: { type: "string", enum: ["GET", "POST"], description: "HTTP method, GET by default" },
      body: { type: "string", description: "Request body for POST (sent as JSON)" },
    },
    required: ["url"],
  },
  summary: (args) => args.url ?? "",
  execute: async (args: ToolArgs) => {
    const url = args.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) throw new Error("Provide an absolute http(s) URL.");
    const method = args.method?.toUpperCase() === "POST" ? "POST" : "GET";
    const response = await fetch(url, {
      method,
      headers: {
        "user-agent": "bajajbot",
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: method === "POST" && args.body ? args.body : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = response.headers.get("content-type") ?? "unknown";
    const full = await response.text();
    const body = full.length > MAX_FETCH ? `${full.slice(0, MAX_FETCH)}\n… truncated (${full.length} chars total)` : full;
    return `HTTP ${response.status} · ${contentType}\n\n${body}`;
  },
};
