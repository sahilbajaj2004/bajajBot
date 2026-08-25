import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { readConfigAt } from "../src/config/store.js";

const dir = mkdtempSync(join(tmpdir(), "bajajbot-store-"));
after(() => rmSync(dir, { recursive: true, force: true }));

test("readConfigAt parses valid config files", () => {
  const path = join(dir, "ok.json");
  writeFileSync(path, '{"provider":"openrouter","apiKey":"k","baseUrl":"https://x/v1","defaultModel":"m"}\n');
  const config = readConfigAt(path);
  assert.equal(config.defaultModel, "m");
});

test("readConfigAt explains corrupted config files instead of a JSON stack trace", () => {
  const path = join(dir, "broken.json");
  writeFileSync(path, '{\n  "provider": "openrouter"\n}ha\n');
  assert.throws(() => readConfigAt(path), /corrupted.*config init/s);
});

test("readConfigAt reports missing files", () => {
  assert.throws(() => readConfigAt(join(dir, "nope.json")), /ENOENT/);
});
