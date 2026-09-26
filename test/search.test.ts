import assert from "node:assert/strict";
import { test } from "node:test";
import { formatResults, parseDdgHtml, unwrapDdgUrl, webSearch } from "../src/util/search.js";

const FIXTURE = `<div class="result"><div class="result__body">
<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&amp;rut=abc">Example <b>Docs</b></a>
<a class="result__snippet" href="#">The &amp; quick <b>brown</b> fox jumps</a>
</div></div>
<div class="result"><div class="result__body">
<a rel="nofollow" class="result__a" href="https://direct.example.org/page">Direct Link</a>
</div></div>`;

test("parseDdgHtml extracts title, unwrapped URL and decoded snippet", () => {
  const results = parseDdgHtml(FIXTURE);
  assert.equal(results.length, 2);
  assert.equal(results[0].title, "Example Docs");
  assert.equal(results[0].url, "https://example.com/docs");
  assert.equal(results[0].snippet, "The & quick brown fox jumps");
  assert.equal(results[1].url, "https://direct.example.org/page");
});

test("unwrapDdgUrl passes through plain and relative URLs", () => {
  assert.equal(unwrapDdgUrl("https://a.b/c"), "https://a.b/c");
  assert.match(unwrapDdgUrl("/l/?uddg=https%3A%2F%2Fx.y"), /^https:\/\/x\.y\/?$/);
});

test("webSearch rejects unknown providers and missing keys with friendly errors", async () => {
  await assert.rejects(
    () => webSearch({ provider: "bing" as never }, "q"),
    /Unknown webSearch provider/,
  );
  await assert.rejects(() => webSearch({ provider: "brave" }, "q"), /webSearch\.apiKey/);
  await assert.rejects(() => webSearch({ provider: "tavily" }, "q"), /webSearch\.apiKey/);
  await assert.rejects(() => webSearch({ provider: "searxng" }, "q"), /webSearch\.searxUrl/);
});

test("formatResults numbers entries and caps output", () => {
  const out = formatResults([
    { title: "A", url: "https://a", snippet: "first" },
    { title: "B", url: "https://b", snippet: "" },
  ]);
  assert.match(out, /1\. A\n   https:\/\/a\n   first/);
  assert.match(out, /2\. B\n   https:\/\/b$/);
  assert.equal(formatResults([]), "No results found.");
});
