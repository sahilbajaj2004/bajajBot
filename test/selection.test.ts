import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractSelectedText,
  normalizeRect,
  segmentLine,
  stripAnsi,
} from "../src/ui/select.js";
import { buildChatLines } from "../src/ui/MessageList.js";
import type { Message } from "../src/session/types.js";

test("stripAnsi removes SGR colors and OSC sequences", () => {
  assert.equal(stripAnsi("\x1b[31mred\x1b[0m"), "red");
  assert.equal(stripAnsi("\x1b]0;title\x07hello"), "hello");
  assert.equal(stripAnsi("plain"), "plain");
});

test("normalizeRect swaps corners regardless of drag direction", () => {
  assert.deepEqual(normalizeRect(10, 5, 2, 1), { left: 2, right: 10, top: 1, bottom: 5 });
  assert.deepEqual(normalizeRect(2, 1, 10, 5), { left: 2, right: 10, top: 1, bottom: 5 });
});

test("extractSelectedText slices partial first/last rows and full middle rows", () => {
  const lines = ["hello world", "second line", "third line"];
  const text = extractSelectedText(lines, { top: 0, left: 6, bottom: 2, right: 4 });
  assert.equal(text, "world\nsecond line\nthird");
});

test("extractSelectedText trims trailing padding and skips out-of-range rows", () => {
  const lines = ["keep me   ", "  padded  "];
  const text = extractSelectedText(lines, { top: 0, left: 0, bottom: 3, right: 50 });
  assert.equal(text, "keep me\n  padded");
  assert.equal(extractSelectedText([], { top: 0, left: 0, bottom: 1, right: 1 }), "");
});

test("extractSelectedText strips ANSI before slicing", () => {
  const lines = ["\x1b[1mbold start\x1b[0m and \x1b[32mgreen\x1b[0m end"];
  assert.equal(extractSelectedText(lines, { top: 0, left: 0, bottom: 0, right: 3 }), "bold");
  assert.equal(extractSelectedText(lines, { top: 0, left: 11, bottom: 0, right: 13 }), "and");
});

test("segmentLine pads and marks the covered columns", () => {
  const segments = segmentLine("hello", 1, 3, 8);
  assert.deepEqual(
    segments.map((segment) => [segment.text, segment.hl]),
    [
      ["h", false],
      ["ell", true],
      ["o   ", false],
    ],
  );
});

test("segmentLine clamps out-of-bounds columns", () => {
  const segments = segmentLine("hi", 0, 99, 4);
  assert.deepEqual(
    segments.map((segment) => [segment.text, segment.hl]),
    [
      ["hi  ", true],
    ],
  );
});

test("buildChatLines exposes plain text for user bubbles and assistant markdown", () => {
  const messages: Message[] = [
    { role: "user", content: "hi there", timestamp: new Date().toISOString() },
    { role: "assistant", content: "hello **world**", timestamp: new Date().toISOString() },
  ];
  const lines = buildChatLines(messages, 60);
  const texts = lines.map((line) => stripAnsi(line.text));
  assert.ok(texts.some((text) => text.includes("│ hi there".padEnd(11)) && text.includes("│")));
  assert.ok(texts.some((text) => text.includes("hello") && text.includes("world")));
});
