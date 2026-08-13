import { Box, Text } from "ink";

export function InputBox({ value, sending }: { value: string; sending: boolean }) {
  return <Box borderStyle="round" borderColor="cyan" paddingX={1}>
    <Text color="cyan">{sending ? "Thinking…" : "> "}</Text>
    <Text>{sending ? "" : value}</Text>
  </Box>;
}
