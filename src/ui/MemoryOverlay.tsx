import { Box, Text, useInput } from "ink";
import { Overlay } from "./Overlay.js";
import { useWindow, WindowHint } from "./ModelPicker.js";

export function MemoryOverlay({ facts, onClose }: { facts: string[]; onClose: () => void }) {
  useInput((_input, key) => {
    if (key.escape || key.return) onClose();
  });
  const active = 0;
  const { viewSize, start } = useWindow(facts.length, active);
  const visible = facts.slice(start, start + viewSize);

  return (
    <Overlay title="Persistent memory">
      {facts.length === 0 ? (
        <Text dimColor>{" Memory is empty — the agent saves durable facts here as it learns your setup."}</Text>
      ) : (
        visible.map((fact, index) => (
          <Text key={`${start + index}-${fact.slice(0, 12)}`}>
            <Text color="green">{" ● "}</Text>
            <Text>{fact.length > 76 ? `${fact.slice(0, 75)}…` : fact}</Text>
          </Text>
        ))
      )}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>~/.bajajbot/memory.md</Text>
        {facts.length > 0 ? <Text dimColor>{`${facts.length} fact(s)`}</Text> : null}
      </Box>
      <WindowHint shown={viewSize} total={facts.length} />
      <Text dimColor>esc close · the agent curates entries via its memory tool</Text>
    </Overlay>
  );
}
