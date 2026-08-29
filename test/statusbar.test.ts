import assert from "node:assert/strict";
import { test } from "node:test";
import { noteKind } from "../src/ui/StatusBar.js";

test("noteKind classes status notes semantically", () => {
  assert.equal(noteKind("✓ Profile active"), "success");
  assert.equal(noteKind("✓ committed — abc123 feat: x"), "success");
  assert.equal(noteKind("⚠ tap esc again to interrupt"), "warn");
  assert.equal(noteKind("⚠ Session spend crossed $2.00"), "warn");
  assert.equal(noteKind("no Ollama server answered at …"), "error");
  assert.equal(noteKind("commit failed: boom"), "error");
  assert.equal(noteKind("app aborted — not running"), "error");
  assert.equal(noteKind("nothing to save yet — send a prompt first"), "error");
  assert.equal(noteKind("⇶ falling back to llama3.2"), "info");
  assert.equal(noteKind("⤳ routed → reviewer"), "info");
  assert.equal(noteKind("⟳ 3 subagents started — esc cancels"), "info");
});