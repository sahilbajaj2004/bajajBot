import { Box, Text, useInput } from "ink";
import { useState } from "react";

export function SessionPicker({
  sessions,
  onSelect,
}: {
  sessions: { id: string; createdAt: string; preview: string }[];
  onSelect: (id?: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  useInput((_input, key) => {
    if (key.upArrow) setSelected((value) => Math.max(0, value - 1));
    else if (key.downArrow) setSelected((value) => Math.min(sessions.length - 1, value + 1));
    else if (key.return) onSelect(sessions[selected]?.id);
    else if (key.escape) onSelect();
  });

  return <Box flexDirection="column">
    <Text bold>Choose session</Text>
    {sessions.map((session, index) => <Text key={session.id} color={index === selected ? "cyan" : undefined}>
      {index === selected ? "> " : "  "}{session.preview} · {session.createdAt}
    </Text>)}
  </Box>;
}
