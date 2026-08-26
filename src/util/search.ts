/**
 * Web search backends behind the agent's web_search tool. The default
 * (duckduckgo) needs no key — it scrapes the HTML endpoint. Brave/Tavily use
 * free-tier API keys, SearXNG points at a self-hosted instance. All parsing
 * is pure so it can be tested offline against fixtures.
 */

export interface WebSearchConfig {
  provider?: "duckduckgo" | "brave" | "tavily" | "searxng";
  apiKey?: string;
  searxUrl?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const FETCH_TIMEOUT = 12_000;
/** Full browser UA — the plain "bajajbot" one trips DDG's anomaly check more often. */
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";

async function fetchText(url: string, init: RequestInit = {}): Promise<string | null> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!response.ok && response.status !== 202) {
    throw new Error(`Search backend returned HTTP ${response.status}.`);
  }
  const text = await response.text();
  // 202 or empty body = bot-anomaly interstitial; caller decides whether to retry.
  return response.status === 202 ? null : text;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/** DDG wraps result URLs in /l/?uddg=<encoded> redirects when tracking. */
export function unwrapDdgUrl(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return href;
  }
}

/** Parse the html.duckduckgo.com results page (markup as of 2026-08). */
export function parseDdgHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // Class token only — real blocks look like class="links_main links_deep result__body".
  const blocks = html.split(/result__body/).slice(1);
  for (const block of blocks) {
    const linkMatch = block.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const href = linkMatch[0].match(/href="([^"]+)"/)?.[1];
    if (!href) continue;
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const title = stripTags(linkMatch[1]);
    if (!title) continue;
    results.push({
      title,
      url: unwrapDdgUrl(decodeEntities(href)),
      snippet: snippetMatch ? stripTags(snippetMatch[1]).slice(0, 300) : "",
    });
  }
  return results;
}

async function searchDuckDuckGo(query: string, count: number): Promise<SearchResult[]> {
  const body = new URLSearchParams({ q: query }).toString();
  // Primary: form POST. On a bot-anomaly page (202), retry once as GET with
  // browser headers — different fingerprint usually passes.
  let html =
    (await fetchText("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": BROWSER_UA,
        accept: "text/html",
      },
      body,
    })) ??
    (await fetchText(`https://html.duckduckgo.com/html/?${body}`, {
      headers: { "user-agent": BROWSER_UA, accept: "text/html", "accept-language": "en-US,en;q=0.9" },
    }));
  if (!html) {
    throw new Error(
      "DuckDuckGo is bot-checking requests right now. Retry in a moment, or set webSearch.provider to brave/tavily/searxng for reliable results.",
    );
  }
  return parseDdgHtml(html).slice(0, count);
}

async function searchBrave(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: String(count) })}`,
    { headers: { accept: "application/json", "x-subscription-token": apiKey }, signal: AbortSignal.timeout(FETCH_TIMEOUT) },
  );
  if (!response.ok) throw new Error(`Brave Search returned HTTP ${response.status} (${response.status === 401 ? "check webSearch.apiKey" : "rate limited?"}).`);
  const data = (await response.json()) as { web?: { results?: Array<{ title: string; url: string; description?: string }> } };
  return (data.web?.results ?? []).slice(0, count).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: stripTags(r.description ?? ""),
  }));
}

async function searchTavily(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: count }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) throw new Error(`Tavily returned HTTP ${response.status} (${response.status === 401 ? "check webSearch.apiKey" : "quota?"}).`);
  const data = (await response.json()) as { results?: Array<{ title: string; url: string; content?: string }> };
  return (data.results ?? []).slice(0, count).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: (r.content ?? "").slice(0, 300),
  }));
}

async function searchSearxng(query: string, count: number, base: string): Promise<SearchResult[]> {
  const response = await fetch(
    `${base.replace(/\/+$/, "")}/search?${new URLSearchParams({ q: query, format: "json" })}`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT) },
  );
  if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status} (is "search formats: json" enabled on your instance?).`);
  const data = (await response.json()) as { results?: Array<{ title: string; url: string; content?: string }> };
  return (data.results ?? []).slice(0, count).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: (r.content ?? "").slice(0, 300),
  }));
}

/** Dispatch to the configured backend. Throws friendly config errors. */
export async function webSearch(config: WebSearchConfig, query: string, count = 5): Promise<SearchResult[]> {
  const provider = config.provider ?? "duckduckgo";
  switch (provider) {
    case "duckduckgo":
      return searchDuckDuckGo(query, count);
    case "brave":
      if (!config.apiKey) throw new Error('Brave needs a key: set webSearch.apiKey in ~/.bajajbot/config.json (free at brave.com/search/api).');
      return searchBrave(query, count, config.apiKey);
    case "tavily":
      if (!config.apiKey) throw new Error('Tavily needs a key: set webSearch.apiKey in ~/.bajajbot/config.json (free at tavily.com).');
      return searchTavily(query, count, config.apiKey);
    case "searxng":
      if (!config.searxUrl) throw new Error("SearXNG needs your instance URL: set webSearch.searxUrl in ~/.bajajbot/config.json.");
      return searchSearxng(query, count, config.searxUrl);
    default:
      throw new Error(`Unknown webSearch provider "${provider}". Options: duckduckgo, brave, tavily, searxng.`);
  }
}

/** Compact numbered rendering for tool output. */
export function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return "No results found.";
  const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`);
  return lines.join("\n").slice(0, 5_000);
}
