import assert from "node:assert/strict";
import { test } from "node:test";
import { toMarkdown } from "../src/session/export.js";
import type { Message } from "../src/session/types.js";

const messages: Message[] = [
  { role: "user", content: "what is 2+2?", timestamp: "t1" },
  { role: "assistant", content: "**4**", timestamp: "t2" },
  { role: "tool", content: "Error: nope\nmore", timestamp: "t3", toolCallId: "c1" },
];

test("toMarkdown renders user, assistant and condensed tool blocks", () => {
  const markdown = toMarkdown("test-model", messages);
  assert.ok(markdown.includes("# bajajbot chat"));
  assert.ok(markdown.includes("- Model: `test-model`"));
  assert.ok(markdown.includes("## You\n\nwhat is 2+2?"));
  assert.ok(markdown.includes("## Assistant\n\n**4**"));
  assert.ok(markdown.includes("> ⚙ tool result: Error: nope"));
  assert.ok(!markdown.includes("more"));
});

test("toMarkdown handles empty chats", () => {
  const markdown = toMarkdown("m", []);
  assert.ok(markdown.includes("# bajajbot chat"));
  assert.equal(markdown.trimEnd().split("\n").length, 4);
});
