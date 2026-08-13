import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSession, listSessions, loadSession, saveSession } from "../src/session/history.js";

test("sessions save, load, and list a user-message preview", () => {
  const temporaryHome = mkdtempSync(join(tmpdir(), "bajajbot-test-"));
  const previousHome = process.env.HOME;
  process.env.HOME = temporaryHome;
  try {
    const session = createSession("test-model");
    session.messages.push({ role: "user", content: "Remember this conversation", timestamp: session.createdAt });
    saveSession(session);
    assert.deepEqual(loadSession(session.id), session);
    assert.deepEqual(listSessions().map(({ id, preview }) => ({ id, preview })), [{
      id: session.id,
      preview: "Remember this conversation",
    }]);
  } finally {
    previousHome === undefined ? delete process.env.HOME : (process.env.HOME = previousHome);
    rmSync(temporaryHome, { recursive: true, force: true });
  }
});
