import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChatLines } from "../src/ui/MessageList.js";
import {
  MAX_DETAIL_LINES,
  VERBOSITY_LEVELS,
  nextVerbosity,
  normalizeVerbosity,
  showsToolArgs,
  showsToolOutput,
} from "../src/ui/verbosity.js";
import type { Message } from "../src/session/types.js";

const ts = "2026-01-01T00:00:00.000Z";

/** A tool call with a real argument object, so the arg body has something to show. */
const callMessage: Message = {
  role: "assistant",
  content: "",
  timestamp: ts,
  toolCalls: [
    {
      id: "c1",
      name: "read",
      args: JSON.stringify({ path: "src/app.tsx", limit: 40 }),
    },
  ],
};

/** A tool result whose body is far longer than the one-line summary. */
const outputBody = ["const first = 1;", ...Array.from({ length: 4 }, (_, i) => `const line${i} = ${i};`)];
const toolMessage: Message = {
  role: "tool",
  content: outputBody.join("\n"),
  timestamp: ts,
  toolCallId: "c1",
};

/** Plain text of the rendered transcript. */
const plain = (messages: Message[], level?: (typeof VERBOSITY_LEVELS)[number]): string =>
  buildChatLines(messages, 80, level)
    .map((line) => line.text)
    .join("\n");

test("normalizeVerbosity accepts the three levels and rejects anything else", () => {
  assert.equal(normalizeVerbosity("quiet"), "quiet");
  assert.equal(normalizeVerbosity("normal"), "normal");
  assert.equal(normalizeVerbosity("verbose"), "verbose");
  // A typo in the config must not break the chat.
  assert.equal(normalizeVerbosity("loud"), "quiet");
  assert.equal(normalizeVerbosity(undefined), "quiet");
  assert.equal(normalizeVerbosity(3), "quiet");
});

test("nextVerbosity cycles quiet -> normal -> verbose -> quiet", () => {
  assert.equal(nextVerbosity("quiet"), "normal");
  assert.equal(nextVerbosity("normal"), "verbose");
  assert.equal(nextVerbosity("verbose"), "quiet");
});

test("each level shows strictly more than the one before", () => {
  assert.equal(showsToolArgs("quiet"), false);
  assert.equal(showsToolArgs("normal"), true);
  assert.equal(showsToolOutput("normal"), false);
  assert.equal(showsToolOutput("verbose"), true);
});

test("quiet is the default and keeps the one-line transcript", () => {
  const omitted = buildChatLines([callMessage, toolMessage], 80).map((line) => line.text);
  assert.deepEqual(omitted, plain([callMessage, toolMessage], "quiet").split("\n"));
  assert.match(plain([callMessage, toolMessage], "quiet"), /⚙ read src\/app\.tsx/);
  assert.ok(!plain([callMessage, toolMessage], "quiet").includes('"limit"'));
  assert.ok(!plain([callMessage, toolMessage], "quiet").includes("const line2"));
});

test("normal adds the full tool arguments", () => {
  const text = plain([callMessage, toolMessage], "normal");
  assert.match(text, /⚙ read src\/app\.tsx/);
  assert.match(text, /"path": "src\/app\.tsx"/);
  assert.match(text, /"limit": 40/);
  // Args yes, result body no - that is the next level.
  assert.ok(!text.includes("const line2"));
});

test("verbose adds the whole result body", () => {
  const text = plain([callMessage, toolMessage], "verbose");
  assert.match(text, /"limit": 40/);
  for (const row of outputBody.slice(1)) assert.ok(text.includes(row), `missing ${row}`);
});

test("verbose never repeats the summary line it already drew", () => {
  const text = plain([toolMessage], "verbose");
  assert.equal(text.split("\n").filter((line) => line.includes("const first = 1;")).length, 1);
});

test("a single-line result stays one line even at verbose", () => {
  const single: Message = { role: "tool", content: "just one line", timestamp: ts, toolCallId: "c" };
  const lines = buildChatLines([single], 80, "verbose").map((line) => line.text);
  assert.deepEqual(lines, ["  ↳ ✓ just one line"]);
});

test("an empty tool result reports no output instead of crashing", () => {
  const empty: Message = { role: "tool", content: "", timestamp: ts, toolCallId: "c" };
  assert.deepEqual(buildChatLines([empty], 80, "verbose").map((line) => line.text), ["  ↳ ✓ (no output)"]);
});

test("a failed tool result keeps its error colour path and still expands", () => {
  const failed: Message = {
    role: "tool",
    content: "Error: no such file\nat read",
    timestamp: ts,
    toolCallId: "c",
  };
  const text = plain([failed], "verbose");
  assert.match(text, /↳ ✗ Error: no such file/);
  assert.ok(text.includes("at read"));
});

test("expanded detail is capped and says how much was left out", () => {
  const huge: Message = {
    role: "tool",
    content: ["head line", ...Array.from({ length: MAX_DETAIL_LINES + 20 }, (_, i) => `row ${i}`)].join("\n"),
    timestamp: ts,
    toolCallId: "c",
  };
  const text = plain([huge], "verbose");
  assert.ok(text.includes(`+20 more lines`), "expected the overflow count");
  assert.ok(!text.includes(`row ${MAX_DETAIL_LINES}`), "capped rows should stop at the cap");
});

test("a giant argument object is capped too", () => {
  const big: Message = {
    role: "assistant",
    content: "",
    timestamp: ts,
    toolCalls: [
      {
        id: "c",
        name: "write",
        args: JSON.stringify({ content: Array.from({ length: MAX_DETAIL_LINES + 5 }, (_, i) => `l${i}`) }),
      },
    ],
  };
  assert.ok(plain([big], "normal").includes("more arg lines"));
});

test("expanded detail wraps instead of overflowing the terminal", () => {
  // Bubbles wrap, replies wrap, and tool summaries are hard-capped - expanded
  // detail has to obey the same rule or it pushes the layout wider than the
  // terminal and breaks the scroll math.
  const long = "x".repeat(500);
  const wide: Message = { role: "tool", content: `head\n${long}`, timestamp: ts, toolCallId: "c" };
  for (const columns of [40, 60, 100]) {
    for (const line of buildChatLines([wide], columns, "verbose")) {
      assert.ok(
        line.text.length <= columns,
        `at ${columns} columns a line was ${line.text.length} wide: ${line.text.slice(0, 40)}…`,
      );
    }
  }
});

test("wrapped detail keeps every character of the body", () => {
  const body = "y".repeat(250);
  const wide: Message = { role: "tool", content: `head\n${body}`, timestamp: ts, toolCallId: "c" };
  const joined = plain([wide], "verbose").replace(/\s+/g, "");
  assert.equal(joined.split("y").length - 1, 250);
});

test("a long tool summary wraps instead of overflowing, at every level", () => {
  // Pre-existing defect: argPreview caps at 70 characters but never wrapped, so
  // "  ⚙ write <70 chars>" was 80 wide and overran an 80-column terminal.
  const long: Message = {
    role: "assistant",
    content: "",
    timestamp: ts,
    toolCalls: [{ id: "c", name: "read", args: JSON.stringify({ path: "d/".repeat(60) }) }],
  };
  for (const level of VERBOSITY_LEVELS) {
    for (const columns of [40, 80]) {
      for (const line of buildChatLines([long], columns, level)) {
        assert.ok(line.text.length <= columns, `${level} at ${columns}: ${line.text.length} wide`);
      }
    }
  }
});

test("a long tool result summary wraps too", () => {
  const long: Message = { role: "tool", content: "e".repeat(300), timestamp: ts, toolCallId: "c" };
  for (const columns of [40, 80]) {
    for (const line of buildChatLines([long], columns, "quiet")) {
      assert.ok(line.text.length <= columns, `at ${columns}: ${line.text.length} wide`);
    }
  }
});

test("expanded argument detail wraps too", () => {
  const big: Message = {
    role: "assistant",
    content: "",
    timestamp: ts,
    toolCalls: [{ id: "c", name: "write", args: JSON.stringify({ content: "z".repeat(400) }) }],
  };
  for (const line of buildChatLines([big], 50, "normal")) {
    assert.ok(line.text.length <= 50, `line was ${line.text.length} wide`);
  }
});

test("unparsable arguments are shown raw rather than dropped", () => {
  const raw: Message = {
    role: "assistant",
    content: "",
    timestamp: ts,
    toolCalls: [{ id: "c", name: "bash", args: "not json at all" }],
  };
  assert.ok(plain([raw], "normal").includes("not json at all"));
});

test("every level leaves user and assistant text untouched", () => {
  const messages: Message[] = [
    { role: "user", content: "hello there", timestamp: ts },
    { role: "assistant", content: "hi back", timestamp: ts },
  ];
  for (const level of VERBOSITY_LEVELS) {
    const text = plain(messages, level);
    assert.ok(text.includes("hello there"), `${level} lost the user message`);
    assert.ok(text.includes("hi back"), `${level} lost the assistant message`);
  }
});
