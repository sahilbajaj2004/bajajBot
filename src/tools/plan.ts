import type { PlanItem } from "../session/types.js";
import type { ToolArgs, ToolContext, ToolDef } from "./types.js";

const MAX_ITEMS = 20;
const MAX_TASK_CHARS = 200;
const STATUSES = ["pending", "in_progress", "done"] as const;

/** Coerce loose model output into a clean plan; empty result clears it. */
export function normalizePlanItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PlanItem[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const task = typeof record.task === "string" ? record.task.trim().slice(0, MAX_TASK_CHARS) : "";
    if (!task) continue;
    const status = STATUSES.find((value) => value === record.status) ?? "pending";
    items.push({ task, status });
  }
  return items;
}

export const setPlanTool: ToolDef = {
  name: "set_plan",
  description:
    "Show the user your live task plan. Call this before starting multi-step work and again whenever progress changes (mark steps in_progress/done). Keep tasks short and actionable.",
  risky: false,
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "The full plan; include unchanged steps so the board stays accurate.",
        items: {
          type: "object",
          properties: {
            task: { type: "string", description: "Short step description" },
            status: { type: "string", enum: ["pending", "in_progress", "done"], description: "Current state of the step" },
          },
          required: ["task", "status"],
        },
      },
    },
    required: ["items"],
  },
  summary: () => "",
  execute: (args: ToolArgs, ctx: ToolContext) => {
    const items = normalizePlanItems(args.items);
    ctx.setPlan?.(items);
    if (!items.length) return "Plan cleared.";
    const done = items.filter((item) => item.status === "done").length;
    return `Plan updated: ${done}/${items.length} done.`;
  },
};
