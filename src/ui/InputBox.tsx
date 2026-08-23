import { Box, Text } from "ink";
import { theme } from "./theme.js";

export function InputBox({ value, active }: { value: string; active: boolean }) {
  return (
    <Box borderStyle="round" borderColor={active ? theme.accent : "gray"} paddingX={1}>
      {value ? (
        <Text>
          {value}
          {active ? <Text inverse> </Text> : null}
        </Text>
      ) : (
        <>
          <Text dimColor>{active ? "Type a message… (/ for commands)" : ""}</Text>
          {active ? <Text inverse> </Text> : null}
        </>
      )}
    </Box>
  );
}
