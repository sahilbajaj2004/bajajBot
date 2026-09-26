import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { packageVersion } from "../src/util/pkgVersion.js";

/** Lay out an installed package: node_modules/bajajbot/dist/bin/bajajbot.js */
function installedPackage(version: string): { root: string; bin: string; shim: string } {
  const root = mkdtempSync(join(tmpdir(), "bajajbot-pkg-"));
  const moduleDir = join(root, "node_modules", "bajajbot", "dist", "bin");
  mkdirSync(moduleDir, { recursive: true });
  writeFileSync(join(root, "node_modules", "bajajbot", "package.json"), JSON.stringify({ name: "bajajbot", version }));
  const bin = join(moduleDir, "bajajbot.js");
  writeFileSync(bin, "#!/usr/bin/env node\n");
  // npm links node_modules/.bin/<name> -> ../<pkg>/dist/bin/<name>.js
  const shim = join(root, "node_modules", ".bin", "bajajbot");
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  symlinkSync(bin, shim);
  return { root, bin, shim };
}

test("packageVersion reads the version from an installed package", (t) => {
  const { root, bin } = installedPackage("2.3.4");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(packageVersion(bin), "2.3.4");
});

test("packageVersion resolves npm's .bin symlink", (t) => {
  const { root, shim } = installedPackage("9.9.9");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // This is how the CLI is actually invoked; the naive walk-up misses it.
  assert.equal(packageVersion(shim), "9.9.9");
});

test("packageVersion works when run straight from the repo", (t) => {
  const { root, bin } = installedPackage("1.2.3");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // A parent package.json belonging to someone else must not be picked up.
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "something-else", version: "0.0.1" }));
  assert.equal(packageVersion(bin), "1.2.3");
});

test("packageVersion reports unknown rather than throwing", (t) => {
  const empty = mkdtempSync(join(tmpdir(), "bajajbot-empty-"));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  assert.equal(packageVersion(join(empty, "nope.js")), "unknown");
  assert.equal(packageVersion("/definitely/not/here/at/all"), "unknown");
});
