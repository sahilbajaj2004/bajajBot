import { Box, Text, useStdout } from "ink";
import { DEFAULT_COLUMNS, theme } from "./theme.js";
import { shortSessionId } from "./title.js";

export function StatusBar({
  model,
  tokens,
  streaming,
  note,
  cost,
  contextPercent,
  sessionId,
  sessionTitle,
  tip,
}: {
  model: string;
  tokens: number | null;
  streaming: boolean;
  note?: string;
  cost?: number | null;
  /** Estimated share of the context budget in use (0-100+). */
  contextPercent?: number;
  /** Open session id — rendered as a "#fc68"-style badge. */
  sessionId?: string;
  /** Auto-derived conversation title (shown on wide terminals). */
  sessionTitle?: string;
  /** Contextual command hint replacing the static copy hint. */
  tip?: string;
}) {
  const { stdout } = useStdout();
  const wide = (stdout.columns ?? DEFAULT_COLUMNS) >= 70;
  const extraWide = (stdout.columns ?? DEFAULT_COLUMNS) >= 104;
  const money =
    cost == null || cost <= 0 ? "" : `$${cost >= 0.01 ? cost.toFixed(2) : cost.toFixed(4)} · `;
  const gauge =
    contextPercent == null ? null : (
      <Text
        bold={contextPercent >= 80}
        color={contextPercent >= 90 ? theme.danger : contextPercent >= 70 ? "yellow" : undefined}
        dimColor={contextPercent < 70}
      >
        {` · ctx ${Math.round(contextPercent)}%`}
      </Text>
    );
  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray" />
      <Box justifyContent="space-between" marginTop={0}>
        <Text>
          <Text bold color={theme.accent}>Welcome to </Text>
          <Text bold>bajajbot</Text>
          {sessionId ? (
            <Text dimColor>
              {` · #${shortSessionId(sessionId)}`}
              {extraWide && sessionTitle
                ? ` · ${sessionTitle.length > 24 ? `${sessionTitle.slice(0, 23)}…` : sessionTitle}`
                : ""}
            </Text>
          ) : null}
          <Text dimColor> · {model}</Text>
          {gauge}
        </Text>
        {note ? (
          <Text bold color="green">{note}</Text>
        ) : (
          <Text dimColor>
            {streaming ? (
              <>
                <Text color="yellow">● streaming</Text>
                {" · "}
                <Text bold>esc interrupt</Text>
                {" · "}
              </>
            ) : null}
            {tokens !== null ? `${tokens.toLocaleString()} tok · ` : ""}
            {money}
            {wide ? `${tip ?? "drag text to copy"} · ctrl+c exit` : ""}
          </Text>
        )}
      </Box>
    </Box>
  );
}
