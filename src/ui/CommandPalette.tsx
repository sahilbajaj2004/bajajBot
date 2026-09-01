import { Text, useInput } from "ink";
import { useState } from "react";
import type { CommandDef } from "./commands.js";
import { WindowHint, useWindow } from "./ModelPicker.js";
import { Overlay } from "./Overlay.js";
import { theme } from "./theme.js";
import { paletteMatch } from "./palette.js";

export function CommandPalette({
  commands,
  onRun,
  onClose,
}: {
  commands: CommandDef[];
  onRun: (command: CommandDef) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = commands.filter((command) => paletteMatch(query, command));
  const needles = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const { viewSize, start } = useWindow(filtered.length, selected);
  const visible = filtered.slice(start, start + viewSize);

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (key.return) {
      const target = filtered[selected];
      if (target) onRun(target);
      return;
    }
    if (key.upArrow) return setSelected(Math.max(0, selected - 1));
    if (key.downArrow) return setSelected(Math.min(filtered.length - 1, selected + 1));
    if (key.backspace || key.delete) return setQuery((value) => value.slice(0, -1));
    if (!key.ctrl && !key.meta && input) {
      setQuery((value) => value + input);
      setSelected(0);
    }
  });

  return (
    <Overlay title="Command palette — find and run a command">
      <Text bold color={theme.accent}>{`  › /${query}█`}</Text>
      {filtered.length === 0 ? (
        <Text dimColor>{`  No command matches "${query}".`}</Text>
      ) : (
        visible.map((command, index) => {
          const at = start + index;
          const highlighted = needles.some((needle) => command.description.toLowerCase().includes(needle));
          return (
            <Text key={command.name} bold={at === selected} color={at === selected ? theme.accent : undefined}>
              {" "}
              {at === selected ? "›" : " "}
              {command.name.padEnd(11)}
              <Text color={highlighted ? undefined : theme.danger} dimColor>
                {command.description}
              </Text>
            </Text>
          );
        })
      )}
      <Text> </Text>
      <WindowHint shown={viewSize} total={filtered.length} />
      <Text dimColor>{"  ↩ run · ↑↓ select · type to filter · esc close"}</Text>
    </Overlay>
  );
}