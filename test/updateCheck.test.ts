import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { checkForUpdate, isNewerVersion } from "../src/util/updateCheck.js";

const originalFetch = globalThis.fetch;
const dir = mkdtempSync(join(tmpdir(), "bajajbot-upd-"));
after(() => {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
});

test("isNewerVersion compares semver numerically", () => {
  assert.equal(isNewerVersion("1.1.0", "1.2.0"), true);
  assert.equal(isNewerVersion("1.1.0", "1.10.0"), true);
  assert.equal(isNewerVersion("2.0.0", "1.9.9"), false);
  assert.equal(isNewerVersion("1.1.0", "1.1.0"), false);
  assert.equal(isNewerVersion("1.1.0", "1.1.0-beta.3"), false);
});

test("checkForUpdate reports newer versions and respects the 24h marker", async () => {
  const marker = join(dir, "last-update-check");
  const opts = { markerFile: marker };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 })) as typeof fetch;

  assert.equal(await checkForUpdate("1.1.0", opts), "9.9.9");

  // marker was written — a second call within 24h must not hit the network
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await checkForUpdate("1.1.0", opts), null);
  assert.equal(calls, 0);

  // aging the marker past 24h makes it check again
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
  utimesSync(marker, old, old);
  assert.equal(await checkForUpdate("1.1.0", opts), "9.9.9");
  assert.equal(calls, 1);
});

test("checkForUpdate stays silent on network errors and same versions", async () => {
  const marker = join(dir, "marker2");
  writeFileSync(marker, "fresh\n");
  utimesSync(marker, new Date(), new Date());
  // recent marker short-circuits even when offline
  assert.equal(await checkForUpdate("1.1.0", { markerFile: marker }), null);

  const stale = join(dir, "marker3");
  writeFileSync(stale, "stale\n");
  utimesSync(stale, new Date(0), new Date(0));
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  assert.equal(await checkForUpdate("1.1.0", { markerFile: stale }), null);
});
