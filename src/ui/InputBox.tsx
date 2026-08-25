import { Box, Text } from "ink";
import { theme } from "./theme.js";

export function InputBox({ value, cursor, active }: { value: string; cursor: number; active: boolean }) {
  const position = Math.min(Math.max(cursor, 0), value.length);
  const before = value.slice(0, position);
  const at = value.slice(position, position + 1);
  return (
    <Box borderStyle="round" borderColor={active ? theme.accent : "gray"} paddingX={1}>
      {value || at ? (
        <Text>
          {before}
          {at ? <Text inverse>{at}</Text> : <Text inverse> </Text>}
          {value.slice(position + (at ? 1 : 0))}
        </Text>
      ) : (
        <Text>
          <Text dimColor>{active ? `Type a message… (/ for commands)` : `Type to queue a message…`}</Text>
          <Text inverse> </Text>
        </Text>
      )}
    </Box>
  );
}
