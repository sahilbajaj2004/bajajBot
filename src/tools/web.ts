import type { ToolArgs, ToolDef } from "./types.js";
import { loadConfig } from "../config/store.js";
import { formatResults, webSearch } from "../util/search.js";

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

export const webSearchTool: ToolDef = {
  name: "web_search",
  description:
    "Search the web and return ranked results (title, URL, snippet). Use for current events, docs lookups, and anything past your knowledge cutoff; follow up with fetch_url for full pages.",
  risky: false,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      results: { type: "string", description: "How many results, 1-10 (default 5)" },
    },
    required: ["query"],
  },
  summary: (args) => args.query ?? "",
  execute: async (args: ToolArgs) => {
    const query = args.query?.trim();
    if (!query) throw new Error("Provide a search query.");
    const count = Math.min(Math.max(Number.parseInt(args.results ?? "5", 10) || 5, 1), 10);
    const results = await webSearch(loadConfig().webSearch ?? {}, query, count);
    return `${formatResults(results)}\n\n(use fetch_url on a result to read the full page)`;
  },
};
