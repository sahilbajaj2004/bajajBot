import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { Profile } from "../config/types.js";
import { theme } from "./theme.js";
import { Overlay } from "./Overlay.js";
import { useWindow, WindowHint } from "./ModelPicker.js";

export function ProfilePicker({
  profiles,
  active,
  onSelect,
}: {
  profiles: Record<string, Profile>;
  active: string;
  onSelect: (name?: string) => void;
}) {
  const names = Object.keys(profiles);
  const [selected, setSelected] = useState(0);
  const activeRow = Math.min(selected, Math.max(0, names.length - 1));
  const { viewSize, start } = useWindow(names.length, activeRow);
  const visible = names.slice(start, start + viewSize).map((name) => ({ name, profile: profiles[name] }));

  useInput((_input, key) => {
    if (key.upArrow) setSelected(Math.max(0, activeRow - 1));
    else if (key.downArrow) setSelected(Math.min(names.length - 1, activeRow + 1));
    else if (key.pageUp) setSelected(0);
    else if (key.pageDown) setSelected(names.length - 1);
    else if (key.return) onSelect(names[activeRow]);
    else if (key.escape) onSelect();
  });

  return (
    <Overlay title="Switch profile">
      {names.length === 0 ? <Text dimColor> No profiles saved.</Text> : null}
      {visible.map(({ name, profile }, rowIndex) => {
        const isActive = start + rowIndex === activeRow;
        const isCurrent = name === active;
        return (
          <Text key={name} bold={isActive} color={isActive ? theme.accent : undefined}>
            {` ${isActive ? "›" : " "} ${name}`}
            <Text dimColor>
              {` · ${profile.provider} · ${profile.defaultModel}${isCurrent ? " · current" : ""}`}
            </Text>
          </Text>
        );
      })}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>Profiles</Text>
        {names.length > 0 ? (
          <Text dimColor>{activeRow + 1}/{names.length}</Text>
        ) : null}
      </Box>
      <WindowHint shown={viewSize} total={names.length} />
      <Text dimColor>↑↓ select · enter switch · esc close</Text>
    </Overlay>
  );
}
