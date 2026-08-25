import { Command } from "commander";
import { loadAllSessions } from "../session/history.js";
import { aggregateUsage, formatUsageTotals } from "../session/usage.js";

export function registerUsageCommand(program: Command): void {
  program
    .command("usage")
    .description("Show token and cost totals across all saved chats")
    .action(() => {
      console.log(formatUsageTotals(aggregateUsage(loadAllSessions())));
    });
}
