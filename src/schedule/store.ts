import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appDir } from "../config/store.js";
import { parseCron, nextCronDate } from "./cron.js";
import type { ScheduledPrompt } from "./types.js";

/** Split a string into tokens, honoring double-quoted segments. */
export function parseQuotedArgs(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuote = false;
  for (const ch of input.trim()) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === " " && !inQuote) {
      if (current) {
        out.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

const schedulesPath = () => join(appDir(), "schedules.json");

export function loadSchedules(): ScheduledPrompt[] {
  if (!existsSync(schedulesPath())) return [];
  return JSON.parse(readFileSync(schedulesPath(), "utf8")) as ScheduledPrompt[];
}

export function saveSchedules(schedules: ScheduledPrompt[]): void {
  mkdirSync(appDir(), { recursive: true });
  writeFileSync(schedulesPath(), `${JSON.stringify(schedules, null, 2)}\n`, { mode: 0o600 });
}

export function addSchedule(entry: Omit<ScheduledPrompt, "nextRunISO">): ScheduledPrompt {
  const parsed = parseCron(entry.cron);
  const next = nextCronDate(parsed, new Date());
  const schedule: ScheduledPrompt = { ...entry, nextRunISO: next.toISOString() };
  const schedules = loadSchedules().filter((s) => s.name !== entry.name);
  schedules.push(schedule);
  saveSchedules(schedules);
  return schedule;
}

export function removeSchedule(name: string): boolean {
  const before = loadSchedules();
  const after = before.filter((s) => s.name !== name);
  if (after.length === before.length) return false;
  saveSchedules(after);
  return true;
}

export function touchSchedule(name: string): ScheduledPrompt | undefined {
  const schedules = loadSchedules();
  const schedule = schedules.find((s) => s.name === name);
  if (!schedule) return undefined;
  const now = new Date();
  schedule.lastRunISO = now.toISOString();
  try {
    const parsed = parseCron(schedule.cron);
    schedule.nextRunISO = nextCronDate(parsed, now).toISOString();
  } catch {
    // Pause a broken schedule (e.g. hand-edited cron) instead of busy-looping.
    schedule.nextRunISO = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000).toISOString();
  }
  saveSchedules(schedules);
  return schedule;
}