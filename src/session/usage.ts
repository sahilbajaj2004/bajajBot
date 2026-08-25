import type { Session, SessionUsage } from "./types.js";

export interface ModelUsage {
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface UsageTotals {
  sessions: number;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  byModel: ModelUsage[];
}

export const emptyUsage = (): SessionUsage => ({ requests: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 });

export function addUsage(total: SessionUsage, delta: SessionUsage): SessionUsage {
  return {
    requests: total.requests + delta.requests,
    promptTokens: total.promptTokens + delta.promptTokens,
    completionTokens: total.completionTokens + delta.completionTokens,
    costUsd: total.costUsd + delta.costUsd,
  };
}

/** Roll up per-session usage records into grand totals plus a per-model breakdown. */
export function aggregateUsage(sessions: Session[]): UsageTotals {
  const totals: UsageTotals = { sessions: sessions.length, requests: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, byModel: [] };
  const models = new Map<string, SessionUsage>();
  for (const session of sessions) {
    const usage = session.usage;
    if (!usage) continue;
    totals.requests += usage.requests;
    totals.promptTokens += usage.promptTokens;
    totals.completionTokens += usage.completionTokens;
    totals.costUsd += usage.costUsd;
    const entry = models.get(session.model) ?? { requests: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
    models.set(session.model, {
      requests: entry.requests + usage.requests,
      promptTokens: entry.promptTokens + usage.promptTokens,
      completionTokens: entry.completionTokens + usage.completionTokens,
      costUsd: entry.costUsd + usage.costUsd,
    });
  }
  totals.byModel = [...models.entries()]
    .map(([model, entry]) => ({ model, ...entry }))
    .sort((a, b) => b.requests - a.requests || b.costUsd - a.costUsd);
  return totals;
}
