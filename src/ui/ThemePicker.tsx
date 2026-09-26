import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { THEMES, theme } from "./theme.js";
import { Overlay } from "./Overlay.js";

const NAMES = Object.keys(THEMES);

export function ThemePicker({ onSelect }: { onSelect: (name?: string) => void }) {
  const [selected, setSelected] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setSelected(Math.max(0, selected - 1));
    else if (key.downArrow) setSelected(Math.min(NAMES.length - 1, selected + 1));
    else if (key.return) onSelect(NAMES[selected]);
    else if (key.escape) onSelect();
  });

  return (
    <Overlay title="Theme">
      {NAMES.map((name, index) => {
        const isActive = index === selected;
        const palette = THEMES[name];
        return (
          <Text key={name} bold={isActive}>
            <Text color={isActive ? theme.accent : undefined}>{` ${isActive ? "›" : " "} ${name.padEnd(8)}`}</Text>
            <Text color={palette.accent}>{"███"}</Text>
            <Text color={palette.success}>{"███"}</Text>
            <Text color={palette.danger}>{"███"}</Text>
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>↑↓ select · enter apply · esc close</Text>
      </Box>
    </Overlay>
  );
}
