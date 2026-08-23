import { Box, Text } from "ink";
import type { CommandDef } from "./commands.js";
import { theme } from "./theme.js";

export function Autocomplete({ commands, selected }: { commands: CommandDef[]; selected: number }) {
  const active = Math.min(selected, commands.length - 1);
  return (
    <Box flexDirection="column" paddingX={1}>
      {commands.map((command, index) => (
        <Text key={command.name} bold={index === active} color={index === active ? theme.accent : undefined}>
          {` ${index === active ? "›" : " "} ${command.name.padEnd(11)}`}
          {index === active ? command.description : ""}
        </Text>
      ))}
    </Box>
  );
}
