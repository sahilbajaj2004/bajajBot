import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { Skill } from "../tools/skills.js";
import { theme } from "./theme.js";
import { Overlay } from "./Overlay.js";
import { useWindow, WindowHint } from "./ModelPicker.js";

export function SkillPicker({
  skills,
  onSelect,
}: {
  skills: Skill[];
  onSelect: (name?: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, skills.length - 1));
  const { viewSize, start } = useWindow(skills.length, active);
  const visible = skills.slice(start, start + viewSize);

  useInput((_input, key) => {
    if (key.upArrow) setSelected(Math.max(0, active - 1));
    else if (key.downArrow) setSelected(Math.min(skills.length - 1, active + 1));
    else if (key.pageUp) setSelected(0);
    else if (key.pageDown) setSelected(skills.length - 1);
    else if (key.return) onSelect(skills[active]?.name);
    else if (key.escape) onSelect();
  });

  return (
    <Overlay title="Skills">
      {skills.length === 0 ? (
        <Text dimColor>{" No skills installed."}</Text>
      ) : null}
      {visible.map((skill, index) => {
        const isActive = start + index === active;
        return (
          <Text key={`${skill.origin}-${skill.name}`} bold={isActive} color={isActive ? theme.accent : undefined}>
            {` ${isActive ? "›" : " "} ${skill.name.padEnd(14)}`}
            <Text dimColor>
              {`${skill.description.slice(0, 44)} · ${skill.origin}`}
            </Text>
          </Text>
        );
      })}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>sources: project/.claude · ~/.bajajbot · ~/.claude · ~/.agents · ~/.codex</Text>
        {skills.length > 0 ? (
          <Text dimColor>{active + 1}/{skills.length}</Text>
        ) : null}
      </Box>
      <WindowHint shown={viewSize} total={skills.length} />
      <Text dimColor>↑↓ select · enter run this skill now · esc close</Text>
    </Overlay>
  );
}
