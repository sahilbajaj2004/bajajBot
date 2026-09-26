import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { theme } from "./theme.js";
import { Overlay } from "./Overlay.js";
import { useWindow, WindowHint } from "./ModelPicker.js";

export interface SearchMatch {
  /** Index of the matching message within the chat transcript. */
  messageIndex: number;
  role: "user" | "assistant" | "tool";
  /** Match with a little surrounding context, single line. */
  snippet: string;
}

const ROLE_LABEL: Record<SearchMatch["role"], string> = {
  user: "you",
  assistant: "bot",
  tool: "tool",
};

export function SearchDialog({
  matches,
  query,
  onClose,
  onSelect,
}: {
  matches: SearchMatch[];
  query: string;
  onClose: () => void;
  onSelect: (match?: SearchMatch) => void;
}) {
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, matches.length - 1));
  const { viewSize, start } = useWindow(matches.length, active);
  const visible = matches.slice(start, start + viewSize);

  useInput((_input, key) => {
    if (key.upArrow) setSelected(Math.max(0, active - 1));
    else if (key.downArrow) setSelected(Math.min(matches.length - 1, active + 1));
    else if (key.pageUp) setSelected(0);
    else if (key.pageDown) setSelected(matches.length - 1);
    else if (key.return) onSelect(matches[active]);
    else if (key.escape) onClose();
  });

  return (
    <Overlay title={`Matches for "${query}"`}>
      {matches.length === 0 ? <Text dimColor> No matches.</Text> : null}
      {visible.map((match, index) => {
        const isActive = start + index === active;
        return (
          <Text key={`${match.messageIndex}-${index}`} bold={isActive} color={isActive ? theme.accent : undefined}>
            {` ${isActive ? "›" : " "} `}
            <Text dimColor>{`${ROLE_LABEL[match.role]} · `}</Text>
            {match.snippet}
          </Text>
        );
      })}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>Matches</Text>
        {matches.length > 0 ? (
          <Text dimColor>{active + 1}/{matches.length}</Text>
        ) : null}
      </Box>
      <WindowHint shown={viewSize} total={matches.length} />
      <Text dimColor>↑↓ select · enter jump · esc close</Text>
    </Overlay>
  );
}
