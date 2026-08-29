import assert from "node:assert/strict";
import { test } from "node:test";
import { expandSnippetText, insertSnippet, normalizeSnippetName } from "../src/session/snippets.js";

test("insertSnippet merges with a single-space seam", () => {
  assert.equal(insertSnippet("", "fix the build"), "fix the build");
  assert.equal(insertSnippet("please", "fix the build"), "please fix the build");
  assert.equal(insertSnippet("please ", "fix the build"), "please fix the build");
  assert.equal(insertSnippet("please\n", "fix the build"), "please\nfix the build");
});

test("normalizeSnippetName lowercases and hyphenates whitespace", () => {
  assert.equal(normalizeSnippetName("  Deploy Fix T3  "), "deploy-fix-t3");
  assert.equal(normalizeSnippetName(""), "");
});

test("expandSnippetText converts literal \\n to newlines", () => {
  assert.equal(expandSnippetText("line one\\nline two"), "line one\nline two");
  assert.equal(expandSnippetText("plain"), "plain");
});