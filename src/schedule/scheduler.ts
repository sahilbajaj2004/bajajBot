import { createSession, saveSession } from "../session/history.js";
import { runPrintTurn } from "../commands/printCmd.js";
import { loadSchedules, touchSchedule } from "./store.js";
import type { Config } from "../config/types.js";

const POLL_MS = 60_000;

function due(schedules: ReturnType<typeof loadSchedules>): string[] {
  const now = Date.now();
  return schedules
    .filter((s) => s.nextRunISO && new Date(s.nextRunISO).getTime() <= now)
    .map((s) => s.name);
}

async function runSchedule(name: string, config: Config): Promise<void> {
  const all = loadSchedules();
  const schedule = all.find((s) => s.name === name);
  if (!schedule) return;
  touchSchedule(name);

  const session = createSession(schedule.model ?? config.defaultModel ?? "unknown");
  session.title = `schedule: ${schedule.name}`;

  try {
    const { reply } = await runPrintTurn(
      schedule.model ? { ...config, defaultModel: schedule.model } : config,
      schedule.prompt,
    );
    session.messages.push(
      { role: "user", content: schedule.prompt, timestamp: new Date().toISOString() },
      { role: "assistant", content: reply || "(no reply)", timestamp: new Date().toISOString() },
    );
  } catch (cause) {
    session.messages.push(
      { role: "user", content: schedule.prompt, timestamp: new Date().toISOString() },
      {
        role: "assistant",
        content: `⚠ schedule error: ${cause instanceof Error ? cause.message : String(cause)}`,
        timestamp: new Date().toISOString(),
      },
    );
  }

  session.updatedAt = new Date().toISOString();
  saveSession(session);
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startScheduler(getConfig: () => Config): void {
  stopScheduler();
  const tick = async () => {
    const config = getConfig();
    const dueNames = due(loadSchedules());
    for (const name of dueNames) {
      try {
        await runSchedule(name, config);
      } catch {
        // schedule-level error already caught inside runSchedule
      }
    }
  };
  timer = setInterval(tick, POLL_MS);
}

export function stopScheduler(): void {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}