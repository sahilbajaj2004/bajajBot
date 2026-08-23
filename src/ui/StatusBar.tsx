import { Box, Text, useStdout } from "ink";
import { theme } from "./theme.js";

export function StatusBar({ model, tokens, streaming }: { model: string; tokens: number | null; streaming: boolean }) {
  const { stdout } = useStdout();
  const wide = (stdout.columns ?? 80) >= 70;
  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray" />
      <Box justifyContent="space-between" marginTop={0}>
        <Text>
          <Text bold color={theme.accent}>█▀█ </Text>
          <Text bold>bajajbot</Text>
          <Text dimColor> · {model}</Text>
        </Text>
        <Text dimColor>
          {streaming ? (
            <>
              <Text color="yellow">● streaming… esc stops</Text>
              {" · "}
            </>
          ) : null}
          {tokens !== null ? `${tokens.toLocaleString()} tok · ` : ""}
          {wide ? "ctrl+c exit" : ""}
        </Text>
      </Box>
    </Box>
  );
}
