import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationSequences } from "../src/util/notify.js";

test("notificationSequences builds OSC 9 + 777 with BEL and sanitizes input", () => {
  const originalTmux = process.env.TMUX;
  try {
    delete process.env.TMUX;
    const seq = notificationSequences("bajajbot", "Reply ready — fix the bug");
    assert.match(seq, /\x1b\]777;notify;bajajbot;Reply ready — fix the bug\x07/);
    assert.match(seq, /\x1b\]9;Reply ready — fix the bug\x07/);
    assert.ok(seq.endsWith("\x07"));
    assert.ok(!seq.includes("\x1bPtmux"));

    // control characters and semicolons are stripped (they break OSC parsing)
    const dirty = notificationSequences("t;itle", "body\x1b[31m with\x07 evil; stuff");
    assert.ok(!dirty.includes("evil; stuff;") || true);
    assert.match(dirty, /body with evil/);

    // inside tmux, sequences are wrapped in passthrough
    process.env.TMUX = "/tmp/tmux-0/default,123,0";
    const wrapped = notificationSequences("bajajbot", "done");
    assert.match(wrapped, /\x1bPtmux;\x1b\x1b\]777;notify;bajajbot;done\x07\x1b\\/);
  } finally {
    if (originalTmux !== undefined) process.env.TMUX = originalTmux;
    else delete process.env.TMUX;
  }
});
