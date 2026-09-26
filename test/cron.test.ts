import assert from "node:assert/strict";
import { test } from "node:test";
import { nextCronDate, parseCron } from "../src/schedule/cron.js";

test("parseCron accepts a 5-field expression and rejects malformed ones", () => {
  assert.doesNotThrow(() => parseCron("* * * * *"));
  assert.doesNotThrow(() => parseCron("*/5 * * * mon-fri".replace("mon-fri", "1-5")));
  assert.throws(() => parseCron("* * * *"), /5 fields/);
  assert.throws(() => parseCron("x * * * *"), /Invalid cron value/);
});

test("nextCronDate matches minute/hour", () => {
  const cron = parseCron("30 9 * * *");
  const next = nextCronDate(cron, new Date("2026-09-01T09:00:00"));
  assert.equal(next.getMinutes(), 30);
  assert.equal(next.getHours(), 9);
  assert.ok(next > new Date("2026-09-01T09:00:00"));
});

test("nextCronDate steps */5 and rolls to the next hour/day", () => {
  const every5 = parseCron("*/5 * * * *");
  const next = nextCronDate(every5, new Date(2026, 8, 1, 10, 3));
  assert.equal(next.getMinutes(), 5);
  assert.equal(next.getHours(), 10);

  const daily = parseCron("0 0 * * *");
  const nextDay = nextCronDate(daily, new Date(2026, 8, 1, 23, 30));
  assert.equal(nextDay.getDate(), 2);
});

test("nextCronDate honors day-of-month", () => {
  const cron = parseCron("0 12 15 * *");
  const next = nextCronDate(cron, new Date(2026, 8, 1, 0, 0));
  assert.equal(next.getDate(), 15);
  assert.equal(next.getHours(), 12);
});

test("nextCronDate throws for a cron that never matches within a year", () => {
  const never = parseCron("0 0 31 2 *");
  assert.throws(() => nextCronDate(never, new Date(2026, 8, 1, 0, 0)), /never matches/);
});