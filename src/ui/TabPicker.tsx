import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { theme } from "./theme.js";
import { Overlay } from "./Overlay.js";
import { useWindow, WindowHint } from "./ModelPicker.js";
import { shortSessionId } from "./title.js";
import type { TabView } from "./TabBar.js";

export function TabPicker({
  tabs,
  currentId,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: TabView[];
  currentId: string;
  onSelect: (id?: string) => void;
  onClose: () => void;
  onNew: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, tabs.length - 1));
  const { viewSize, start } = useWindow(tabs.length, active);
  const visible = tabs.slice(start, start + viewSize);

  useInput((input, key) => {
    if (key.upArrow) setSelected(Math.max(0, active - 1));
    else if (key.downArrow) setSelected(Math.min(tabs.length - 1, active + 1));
    else if (key.pageUp) setSelected(0);
    else if (key.pageDown) setSelected(tabs.length - 1);
    else if (key.return) onSelect(tabs[active]?.id);
    else if (key.escape) onClose();
    else if (input === "n") onNew();
    else if (input && /^[1-9]$/.test(input)) {
      const index = Number(input) - 1;
      if (index < tabs.length) onSelect(tabs[index]?.id);
    }
  });

  return (
    <Overlay title={`Tabs - ${tabs.length} open`}>
      {visible.map((tab, index) => {
        const isActive = start + index === active;
        const focused = tab.id === currentId;
        return (
          <Text key={tab.id} bold={isActive} color={isActive ? theme.accent : undefined}>
            {` ${isActive ? "›" : " "} ${start + index + 1}. ${tab.title} `}
            <Text dimColor>· {shortSessionId(tab.id)}</Text>
            {tab.running ? <Text color="yellow"> · working</Text> : null}
            {focused ? <Text bold color={theme.success}> · current</Text> : null}
          </Text>
        );
      })}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>Tabs</Text>
        <Text dimColor>{`${active + 1}/${tabs.length}`}</Text>
      </Box>
      <WindowHint shown={viewSize} total={tabs.length} />
      <Text dimColor>↑↓ select · 1-9 jump · n new tab · enter open · esc close</Text>
    </Overlay>
  );
}
