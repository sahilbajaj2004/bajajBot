import { Box, Text, useInput, useStdout } from "ink";
import { useEffect, useState } from "react";
import type { Config } from "../config/types.js";
import { fetchModels, type ModelInfo } from "../provider/models.js";
import { Overlay } from "./Overlay.js";
import { DEFAULT_ROWS, theme } from "./theme.js";

const MAX_VIEW = 10;

export function useWindow(filteredLength: number, active: number) {
  const { stdout } = useStdout();
  const viewSize = Math.max(3, Math.min(MAX_VIEW, (stdout.rows ?? DEFAULT_ROWS) - 14));
  const start = Math.max(0, Math.min(active - Math.floor(viewSize / 2), filteredLength - viewSize));
  return { viewSize, start };
}

export function WindowHint({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return <Text dimColor>↑↓ scroll</Text>;
}

export function ModelPicker({ config, onSelect }: { config: Config; onSelect: (id?: string) => void }) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchModels(config.baseUrl, config.apiKey)
      .then((list) => !cancelled && setModels(list))
      .catch((cause) => {
        if (cancelled) return;
        setModels([]);
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const manual = models !== null && models.length === 0;
  const filtered = (models ?? []).filter((model) => model.id.toLowerCase().includes(query.toLowerCase()));
  const active = Math.min(selected, Math.max(0, filtered.length - 1));
  const { viewSize, start } = useWindow(filtered.length, active);
  const visible = filtered.slice(start, start + viewSize);

  useInput((input, key) => {
    if (key.escape) return onSelect();
    const selectable = filtered.length > 0;
    if (key.upArrow) return selectable ? setSelected(Math.max(0, active - 1)) : undefined;
    if (key.downArrow) return selectable ? setSelected(Math.min(filtered.length - 1, active + 1)) : undefined;
    if (key.pageUp) return selectable ? setSelected(0) : undefined;
    if (key.pageDown) return selectable ? setSelected(filtered.length - 1) : undefined;
    if (key.return) {
      if (manual) return query.trim() ? onSelect(query.trim()) : undefined;
      return selectable ? onSelect(filtered[active]?.id) : undefined;
    }
    if (key.backspace || key.delete) return setQuery((value) => value.slice(0, -1));
    if (key.ctrl || key.meta || !input) return;
    setQuery((value) => value + input);
    setSelected(0);
  });

  return (
    <Overlay title="Select model">
      {models === null ? (
        <Text dimColor>Loading models…</Text>
      ) : manual ? (
        <>
          {error ? <Text color="red">✗ {error}</Text> : <Text dimColor>No model list from this endpoint.</Text>}
          <Text dimColor>Type a model ID and press Enter.</Text>
        </>
      ) : filtered.length === 0 ? (
        <Text dimColor>No models match "{query}".</Text>
      ) : (
        visible.map((model, index) => {
          const isActive = start + index === active;
          return (
            <Text key={model.id} bold={isActive} color={isActive ? theme.accent : undefined}>
              {` ${isActive ? "›" : " "} ${model.id}`}
            </Text>
          );
        })
      )}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>{manual ? `Model ID: ${query}` : `Search: ${query}`}</Text>
        {!manual && models !== null && filtered.length > 0 ? (
          <Text dimColor>{active + 1}/{filtered.length}</Text>
        ) : null}
      </Box>
      <WindowHint shown={viewSize} total={filtered.length} />
      <Text dimColor>↑↓ select · enter choose · esc close</Text>
    </Overlay>
  );
}
