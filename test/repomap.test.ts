import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, test } from "node:test";
import { MAP_MAX_CHARS, repositoryMap, repoMapBlock } from "../src/tools/repoMap.js";

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "bajajbot-map-"));
  mkdirSync(join(repo, "src", "ui"), { recursive: true });
  mkdirSync(join(repo, "src", "tools"), { recursive: true });
  mkdirSync(join(repo, "node_modules", "x"), { recursive: true });
  mkdirSync(join(repo, ".bajajbot"), { recursive: true });
  writeFileSync(join(repo, "src", "ui", "App.tsx"), "export const App = 1;\n");
  writeFileSync(join(repo, "src", "ui", "Theme.tsx"), "x\n");
  writeFileSync(join(repo, "src", "ui", "styles.css"), "body{}\n");
  writeFileSync(join(repo, "src", "tools", "fs.ts"), "x\n");
  writeFileSync(join(repo, "src", "tools", "web.ts"), "x\n");
  writeFileSync(join(repo, "package.json"), "{};\n");
  writeFileSync(join(repo, "README.md"), "hi\n");
  writeFileSync(join(repo, "node_modules", "x", "index.js"), "x\n");
  writeFileSync(join(repo, ".gitignore"), "x\n");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

test("repositoryMap surfaces source dirs/files and hides dotfiles and node_modules", () => {
  const map = repositoryMap(repo);
  assert.ok(map.includes("./  "));
  assert.ok(map.includes("src/ui/"));
  assert.ok(map.includes("src/tools/"));
  assert.ok(map.includes("App.tsx"));
  assert.ok(map.includes("styles.css"));
  assert.ok(map.includes("package.json"));
  assert.ok(!map.includes("node_modules"));
  assert.ok(!map.includes(".bajajbot"));
  assert.ok(!map.includes(".gitignore"));
});

test("repositoryMap reports extension counts per dir", () => {
  const map = repositoryMap(repo);
  assert.ok(map.includes("ts×2"));
  assert.ok(map.includes("css×1") || map.includes("css ×1"));
});

test("repositoryMap keeps same-named dirs under different parents (path-keyed dedupe)", () => {
  mkdirSync(join(repo, "src", "ui"), { recursive: true });
  mkdirSync(join(repo, "components", "ui"), { recursive: true });
  writeFileSync(join(repo, "components", "ui", "Button.tsx"), "x\n");
  writeFileSync(join(repo, "src", "ui", "Panel.tsx"), "x\n");
  const map = repositoryMap(repo);
  assert.ok(map.includes("components/ui/"));
  assert.ok(map.includes("src/ui/"));
  assert.ok(map.includes("Button.tsx"));
  assert.ok(map.includes("Panel.tsx"));
});

test("repositoryMap is bounded to the char cap and repoMapBlock wraps it", () => {
  const map = repositoryMap(repo);
  assert.ok(map.length <= MAP_MAX_CHARS);
  const block = repoMapBlock(repo);
  assert.ok(block.startsWith("\n\nHere is a map"));
  assert.ok(block.includes(map));
});