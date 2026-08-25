import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "../src/ui/Markdown.js";
import { applyTheme, DEFAULT_THEME, THEMES, theme } from "../src/ui/theme.js";

test("renderMarkdown caches repeated parses and still renders content", () => {
  const content = "# Heading\n\nSome **bold** text with `code`.\n";
  const first = renderMarkdown(content, 80);
  const second = renderMarkdown(content, 80);
  assert.equal(first, second);
  assert.ok(first.includes("Heading"));
  // different width means a different cache entry — both valid renders
  const narrow = renderMarkdown(content, 40);
  assert.ok(narrow.length > 0);
});

test("applyTheme switches the live palette and rejects unknown names", () => {
  const original = { ...theme };
  try {
    assert.equal(applyTheme("ocean"), true);
    assert.equal(theme.accent, THEMES.ocean.accent);
    assert.notEqual(theme.accent, original.accent);
    assert.equal(applyTheme("nope"), false);
    assert.equal(theme.accent, THEMES.ocean.accent); // unchanged on failure
    assert.equal(applyTheme(undefined), false);
  } finally {
    applyTheme(DEFAULT_THEME);
  }
});
