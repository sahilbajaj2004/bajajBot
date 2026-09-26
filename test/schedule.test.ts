import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { addSchedule, loadSchedules, parseQuotedArgs, removeSchedule } from "../src/schedule/store.js";

let home: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "bajajbot-schedule-"));
  process.env.HOME = home;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});

test("addSchedule stores a schedule with a computed nextRun and dedupes by name", () => {
  const first = addSchedule({ name: "standup", cron: "0 9 * * 1-5", prompt: "What did we do?" });
  assert.ok(first.nextRunISO);
  assert.equal(parseCronOk(first.nextRunISO!), true);
  const dupe = addSchedule({ name: "standup", cron: "0 10 * * *", prompt: "updated" });
  assert.ok(dupe.nextRunISO);
  const all = loadSchedules();
  assert.equal(all.length, 1);
  assert.equal(all[0].prompt, "updated");
  assert.equal(all[0].cron, "0 10 * * *");
});

function parseCronOk(iso: string): boolean {
  return !Number.isNaN(Date.parse(iso));
}

test("removeSchedule deletes an entry and reports absence", () => {
  addSchedule({ name: "a", cron: "0 9 * * *", prompt: "1" });
  addSchedule({ name: "b", cron: "0 9 * * *", prompt: "2" });
  assert.equal(removeSchedule("a"), true);
  assert.equal(removeSchedule("a"), false);
  assert.deepEqual(loadSchedules().map((s) => s.name), ["b"]);
});

test("parseQuotedArgs splits honoring double quotes", () => {
  assert.deepEqual(parseQuotedArgs('add standup "0 9 * * 1-5" "what did we do?"'), [
    "add",
    "standup",
    "0 9 * * 1-5",
    "what did we do?",
  ]);
  assert.deepEqual(parseQuotedArgs("rm standup"), ["rm", "standup"]);
  assert.deepEqual(parseQuotedArgs(""), []);
});