import assert from "node:assert/strict";
import { test } from "node:test";
import type { RouteRule } from "../src/config/types.js";
import { compilePattern, matchRoutes } from "../src/session/routing.js";

const rules: RouteRule[] = [
  { pattern: "quick question", model: "fast-model", active: true },
  { pattern: "/long rewrite/", model: "big-model", active: true },
  { pattern: "summarize", model: "disabled-model", active: false },
];

test("keyword patterns match case-insensitively as substrings", () => {
  assert.equal(compilePattern("quick")( "A QUICK QUESTION please"), true);
  assert.equal(compilePattern("quick")("something else entirely"), false);
});

test("slashed patterns compile to case-insensitive regexes", () => {
  assert.equal(compilePattern("/TODO:? clear/")("can you TODO: clear the cache?"), true);
  assert.equal(compilePattern("/^\/route/")("/route is ignored in chat"), true);
});

test("malformed regex patterns fall back to a plain substring match", () => {
  assert.equal(compilePattern("/[/")("path /[ bracket"), true);
});

test("matchRoutes returns the first active match", () => {
  const match = matchRoutes("help me do a long rewrite", rules);
  assert.ok(match);
  assert.equal(match?.rule.model, "big-model");
  assert.equal(match?.label, "big-model");
});

test("matchRoutes skips inactive rules and misses", () => {
  assert.equal(matchRoutes("please summarize the repo", rules), null);
  assert.equal(matchRoutes("hello world", rules), null);
  assert.equal(matchRoutes("todo", undefined), null);
});

test("matchRoutes honors rule.label and first-match-wins ordering", () => {
  const ordered: RouteRule[] = [
    { pattern: "bug", model: "debugger", label: "Debugger", active: true },
    { pattern: "bug hunt", model: "hunter" },
  ];
  const match = matchRoutes("help me bug hunt", ordered);
  assert.equal(match?.label, "Debugger");
  assert.equal(match?.rule.model, "debugger");
});