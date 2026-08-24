import { Box, Text, useStdout } from "ink";
import { DEFAULT_COLUMNS, theme } from "./theme.js";

export function StatusBar({
  model,
  tokens,
  streaming,
  note,
  cost,
}: {
  model: string;
  tokens: number | null;
  streaming: boolean;
  note?: string;
  cost?: number | null;
}) {
  const { stdout } = useStdout();
  const wide = (stdout.columns ?? DEFAULT_COLUMNS) >= 70;
  const money =
    cost == null || cost <= 0 ? "" : `$${cost >= 0.01 ? cost.toFixed(2) : cost.toFixed(4)} · `;
  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray" />
      <Box justifyContent="space-between" marginTop={0}>
        <Text>
          <Text bold color={theme.accent}>Welcome to </Text>
          <Text bold>bajajbot</Text>
          <Text dimColor> · {model}</Text>
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
            {wide ? "drag text to copy · ctrl+c exit" : ""}
          </Text>
        )}
      </Box>
    </Box>
  );
}
