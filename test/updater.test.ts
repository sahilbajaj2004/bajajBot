import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeInstallFailure,
  installArgv,
  installVersion,
  pickProgressLine,
  shouldInstall,
} from "../src/util/updater.js";

/** Run node with a script, standing in for npm. */
const node = (script: string): string[] => ["node", "-e", script];

test("installArgv installs the named version globally", () => {
  const argv = installArgv("3.1.0");
  assert.equal(argv[0], process.platform === "win32" ? "npm.cmd" : "npm");
  assert.deepEqual(argv.slice(1), ["install", "-g", "bajajbot@3.1.0"]);
});

test("shouldInstall only fires for a strictly newer version", () => {
  assert.equal(shouldInstall("3.0.0", "3.0.1"), true);
  assert.equal(shouldInstall("3.0.0", "4.0.0"), true);
  assert.equal(shouldInstall("3.0.0", "3.0.0"), false);
  assert.equal(shouldInstall("3.1.0", "3.0.0"), false);
  assert.equal(shouldInstall("3.0.0", "3.0.0-beta.1"), false);
});

test("pickProgressLine prefers a real line over npm chatter", () => {
  assert.equal(pickProgressLine(["npm warn deprecated foo@1", "added 42 packages in 4s"]), "added 42 packages in 4s");
});

test("pickProgressLine falls back to the last line when all is chatter", () => {
  assert.equal(pickProgressLine(["npm warn a", "npm notice b"]), "npm notice b");
});

test("pickProgressLine ignores blank lines and returns null when empty", () => {
  assert.equal(pickProgressLine(["", "   ", ""]), null);
  assert.equal(pickProgressLine([]), null);
});

test("pickProgressLine shortens a runaway line", () => {
  const detail = pickProgressLine(["x".repeat(400)]);
  assert.ok(detail && detail.length <= 118, String(detail?.length));
  assert.ok(detail?.endsWith("…"));
});

test("installVersion reports success and streams progress", async () => {
  const seen: string[] = [];
  const result = await installVersion("9.9.9", {
    argv: node("console.log('added 3 packages in 1s')"),
    onProgress: (detail) => seen.push(detail),
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
  assert.ok(seen.some((line) => line.includes("added 3 packages")), seen.join("|"));
});

test("installVersion reports a non-zero exit as failure", async () => {
  const result = await installVersion("9.9.9", {
    argv: node("console.error('npm ERR! code EACCES'); process.exit(243)"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 243);
  assert.ok(result.tail.some((line) => line.includes("EACCES")));
});

test("installVersion keeps a tail of the output for the failure detail", async () => {
  const result = await installVersion("9.9.9", {
    argv: node(`for (let i = 0; i < 40; i += 1) console.log('line ' + i); process.exit(1)`),
  });
  assert.equal(result.ok, false);
  assert.ok(result.tail.length <= 12, `tail was ${result.tail.length}`);
  assert.ok(result.tail.at(-1)?.includes("line 39"));
});

test("installVersion surfaces a missing command instead of throwing", async () => {
  const result = await installVersion("9.9.9", { argv: ["bajajbot-no-such-binary-xyz"] });
  assert.equal(result.ok, false);
  assert.match(describeInstallFailure(result), /could not run npm|npm exited/);
});

test("installVersion times out rather than hanging forever", async () => {
  const result = await installVersion("9.9.9", {
    argv: node("setTimeout(() => {}, 60000)"),
    timeoutMs: 300,
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /timed out/);
});

test("installVersion rejects an empty command instead of spawning nothing", async () => {
  const result = await installVersion("9.9.9", { argv: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error, "nothing to run");
});

test("describeInstallFailure explains a permissions problem", () => {
  assert.match(
    describeInstallFailure({ code: 243, tail: ["npm ERR! code EACCES", "permission denied"] }),
    /sudo/,
  );
});

test("describeInstallFailure explains a missing npm", () => {
  assert.match(describeInstallFailure({ code: null, error: "spawn npm ENOENT", tail: [] }), /PATH/);
});

test("describeInstallFailure explains an unknown version", () => {
  assert.match(describeInstallFailure({ code: 1, tail: ["npm ERR! code E404", "404 Not Found"] }), /not on the registry/);
});

test("describeInstallFailure explains a network problem", () => {
  assert.match(describeInstallFailure({ code: 1, tail: ["npm ERR! network ENOTFOUND"] }), /network/);
});

test("describeInstallFailure falls back to the exit code", () => {
  assert.match(describeInstallFailure({ code: 7, tail: ["something odd"] }), /exited with code 7/);
});
