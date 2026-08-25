import { Box, Text } from "ink";
import type { UsageTotals } from "../session/usage.js";
import { theme } from "./theme.js";

function fmtTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text dimColor>{"  " + label.padEnd(18)}</Text>
      <Text bold>{value}</Text>
    </Box>
  );
}

export function UsagePanel({ totals }: { totals: UsageTotals }) {
  const hasUsage = totals.requests > 0;
  return (
    <Box flexDirection="column">
      <Row label="sessions" value={String(totals.sessions)} />
      <Row label="requests" value={String(totals.requests)} />
      <Row label="prompt tokens" value={fmtTokens(totals.promptTokens)} />
      <Row label="reply tokens" value={fmtTokens(totals.completionTokens)} />
      <Row
        label="est. cost"
        value={totals.costUsd > 0 ? `$${totals.costUsd.toFixed(4)}` : hasUsage ? "$0 (free models)" : "—"}
      />
      {totals.byModel.length > 0 ? (
        <>
          <Text> </Text>
          <Text dimColor>{"  top models"}</Text>
          {totals.byModel.slice(0, 5).map((entry) => (
            <Box key={entry.model}>
              <Text>
                {"  "}
                {entry.model.slice(0, 34).padEnd(36)}
              </Text>
              <Text dimColor>
                {`${entry.requests} req · ${fmtTokens(entry.promptTokens + entry.completionTokens)} tok${
                  entry.costUsd > 0 ? ` · $${entry.costUsd.toFixed(4)}` : ""
                }`}
              </Text>
            </Box>
          ))}
        </>
      ) : null}
      {!hasUsage ? (
        <Text> </Text>
      ) : null}
      <Text dimColor>{hasUsage ? "" : "  No usage recorded yet — totals build up as you chat."}</Text>
      <Box marginTop={1}>
        <Text color={theme.accent}>{"  esc close"}</Text>
      </Box>
    </Box>
  );
}
