import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { theme } from "./theme.js";

export function Overlay({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1}>
      <Text bold color={theme.accent}>{title}</Text>
      {children}
    </Box>
  );
}
