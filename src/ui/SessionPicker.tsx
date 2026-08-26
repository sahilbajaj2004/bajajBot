import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { theme } from "./theme.js";
import { Overlay } from "./Overlay.js";
import { useWindow, WindowHint } from "./ModelPicker.js";

export function SessionPicker({
  sessions,
  onSelect,
  currentId,
}: {
  sessions: { id: string; createdAt: string; title?: string; preview: string }[];
  onSelect: (id?: string) => void;
  /** The open session, marked in the list. */
  currentId?: string;
}) {
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, sessions.length - 1));
  const { viewSize, start } = useWindow(sessions.length, active);
  const visible = sessions.slice(start, start + viewSize);

  useInput((_input, key) => {
    if (key.upArrow) setSelected(Math.max(0, active - 1));
    else if (key.downArrow) setSelected(Math.min(sessions.length - 1, active + 1));
    else if (key.pageUp) setSelected(0);
    else if (key.pageDown) setSelected(sessions.length - 1);
    else if (key.return) onSelect(sessions[active]?.id);
    else if (key.escape) onSelect();
  });

  return (
    <Overlay title="Resume session">
      {sessions.length === 0 ? <Text dimColor> No saved sessions.</Text> : null}
      {visible.map((session, index) => {
        const isActive = start + index === active;
        return (
          <Text key={session.id} bold={isActive} color={isActive ? theme.accent : undefined}>
            {` ${isActive ? "›" : " "} ${session.title ?? session.preview} `}
            <Text dimColor>· {session.id}</Text>
            {session.id === currentId ? <Text bold color={theme.success}> · current</Text> : null}
          </Text>
        );
      })}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>Sessions</Text>
        {sessions.length > 0 ? (
          <Text dimColor>{active + 1}/{sessions.length}</Text>
        ) : null}
      </Box>
      <WindowHint shown={viewSize} total={sessions.length} />
      <Text dimColor>↑↓ select · enter resume · esc close</Text>
    </Overlay>
  );
}
