import { Box, Text } from "ink";
import { theme } from "./theme.js";

export function StatusBar({ model, tokens, streaming }: { model: string; tokens: number | null; streaming: boolean }) {
  return (
    <Box justifyContent="space-between">
      <Text dimColor>
        <Text color={streaming ? "yellow" : "green"}>● </Text>
        {model}
        {tokens !== null ? ` · ${tokens.toLocaleString()} tok` : ""}
        {streaming ? " · streaming… esc to stop" : ""}
      </Text>
      <Text dimColor>ctrl+c exit</Text>
    </Box>
  );
}
