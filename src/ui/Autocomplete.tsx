import { Box, Text } from "ink";
import type { CommandDef } from "./commands.js";
import { theme } from "./theme.js";

export function Autocomplete({
  commands,
  selected,
  max = 5,
}: {
  commands: CommandDef[];
  selected: number;
  max?: number;
}) {
  const active = Math.min(Math.max(selected, 0), commands.length - 1);
  const start = Math.max(0, Math.min(active - Math.floor(max / 2), commands.length - max));
  const visible = commands.slice(start, start + max);
  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.map((command, index) => {
        const isActive = start + index === active;
        return (
          <Text key={command.name} bold={isActive} color={isActive ? theme.accent : undefined}>
            {` ${isActive ? "›" : " "} ${command.name.padEnd(11)}`}
            {isActive ? command.description : ""}
          </Text>
        );
      })}
      {commands.length > max ? (
        <Text dimColor>{` ${active + 1}/${commands.length} · keep typing to filter`}</Text>
      ) : null}
    </Box>
  );
}
