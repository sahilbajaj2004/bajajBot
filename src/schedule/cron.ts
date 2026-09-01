/**
 * Minimal 5-field cron parser (minute hour dom dow month).
 * Supports: * any, ranges 1-5, steps like star-slash-5, and lists 1,3,5.
 * Returns the next Date strictly after `after` that matches all fields.
 */

export interface CronField {
  values: Set<number>;
}

export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  dow: CronField;
  month: CronField;
}

function parseField(raw: string, min: number, max: number): CronField {
  const values = new Set<number>();
  for (const part of raw.split(",")) {
    const [range, stepStr] = part.split("/");
    const step = stepStr ? Number(stepStr) : 1;
    if (step < 1) throw new Error("Invalid cron step: " + (stepStr ?? ""));
    if (range === "*") {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (range.includes("-")) {
      const [lo, hi] = range.split("-").map(Number);
      if (Number.isNaN(lo) || Number.isNaN(hi)) throw new Error("Invalid cron range: " + range);
      for (let i = Math.max(lo, min); i <= Math.min(hi, max); i += step) values.add(i);
    } else {
      const n = Number(range);
      if (Number.isNaN(n)) throw new Error("Invalid cron value: " + range);
      values.add(n);
    }
  }
  return { values };
}

export function parseCron(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("Cron expression must have 5 fields, got " + fields.length);
  return {
    minute: parseField(fields[0], 0, 59),
    hour: parseField(fields[1], 0, 23),
    dom: parseField(fields[2], 1, 31),
    month: parseField(fields[3], 1, 12),
    dow: parseField(fields[4], 0, 6),
  };
}

function matchesField(field: CronField, actual: number): boolean {
  return field.values.has(actual);
}

/** Find the next Date strictly after `after` that matches the cron expression. */
export function nextCronDate(cron: ParsedCron, after: Date): Date {
  const d = new Date(after.getTime() + 60_000);
  d.setSeconds(0, 0);

  for (let guard = 0; guard < 366 * 24 * 60; guard += 1) {
    if (
      matchesField(cron.minute, d.getMinutes()) &&
      matchesField(cron.hour, d.getHours()) &&
      matchesField(cron.dom, d.getDate()) &&
      matchesField(cron.month, d.getMonth() + 1) &&
      matchesField(cron.dow, d.getDay())
    ) {
      return d;
    }
    d.setMinutes(d.getMinutes() + 1);
  }
  throw new Error("Cron expression never matches within a year");
}
