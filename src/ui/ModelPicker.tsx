import { Box, Text, useInput, useStdout } from "ink";
import { useEffect, useState } from "react";
import type { Config } from "../config/types.js";
import { fetchModels, orderModels, type ModelInfo } from "../provider/models.js";
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

export function ModelPicker({
  config,
  onSelect,
  onToggleFavorite,
  title = "Select model",
  recentModels = [],
}: {
  config: Config;
  onSelect: (id?: string) => void;
  onToggleFavorite?: (id: string) => void;
  title?: string;
  recentModels?: string[];
}) {
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
  const trimmed = query.trim();
  const hasExact = (models ?? []).some((model) => model.id.toLowerCase() === trimmed.toLowerCase());
  const customId =
    config.provider === "openrouter" && trimmed.length > 0 && !hasExact ? trimmed : null;

  const showRecent = trimmed.length === 0 && recentModels.length > 0;
  const ordered = orderModels(models ?? [], config.favoriteModels);

  let filtered: Array<{ id: string; name?: string; pricing?: unknown; favorite: boolean }>;
  if (showRecent) {
    const modelSet = new Set(ordered.map((e) => e.id.toLowerCase()));
    const recent = recentModels
      .filter((id) => !modelSet.has(id.toLowerCase()))
      .map((id) => ({ id, name: undefined, pricing: undefined, favorite: false }));
    filtered = [...recent, ...ordered];
  } else {
    filtered = ordered.filter((entry) => entry.id.toLowerCase().includes(trimmed.toLowerCase()));
  }

  const rows: Array<{ id: string; custom?: boolean; favorite?: boolean; recent?: boolean }> = [
    ...(customId ? [{ id: customId, custom: true }] : []),
    ...filtered.map((entry) => ({
      id: entry.id,
      favorite: entry.favorite,
      recent: showRecent && !entry.favorite && recentModels.includes(entry.id),
    })),
  ];
  const active = Math.min(selected, Math.max(0, rows.length - 1));
  const { viewSize, start } = useWindow(rows.length, active);
  const visible = rows.slice(start, start + viewSize);

  useInput((input, key) => {
    if (key.escape) return onSelect();
    if (key.upArrow) return rows.length > 0 ? setSelected(Math.max(0, active - 1)) : undefined;
    if (key.downArrow) return rows.length > 0 ? setSelected(Math.min(rows.length - 1, active + 1)) : undefined;
    if (key.pageUp) return rows.length > 0 ? setSelected(0) : undefined;
    if (key.pageDown) return rows.length > 0 ? setSelected(rows.length - 1) : undefined;
    if (key.ctrl && input?.toLowerCase() === "f" && !manual && rows[active] && onToggleFavorite) {
      onToggleFavorite(rows[active].id);
      return;
    }
    if (key.return) {
      if (manual) return query.trim() ? onSelect(query.trim()) : undefined;
      return rows.length > 0 ? onSelect(rows[active]?.id) : undefined;
    }
    if (key.backspace || key.delete) return setQuery((value) => value.slice(0, -1));
    if (key.ctrl || key.meta || !input) return;
    setQuery((value) => value + input);
    setSelected(0);
  });

  return (
    <Overlay title={title}>
      {models === null ? (
        <Text dimColor>Loading models…</Text>
      ) : manual ? (
        <>
          {error ? <Text color="red">✗ {error}</Text> : <Text dimColor>No model list from this endpoint.</Text>}
          <Text dimColor>Type a model ID and press Enter.</Text>
        </>
      ) : rows.length === 0 ? (
        <Text dimColor>No models match "{query}".</Text>
      ) : (
        visible.map((row, index) => {
          const isActive = start + index === active;
          return (
            <Text
              key={row.custom ? `__custom__${row.id}` : row.id}
              bold={isActive}
              color={isActive ? theme.accent : row.custom ? "green" : undefined}
            >
              {` ${isActive ? "›" : " "}${row.favorite ? "★" : " "}${row.recent ? "↻" : " "} ${row.custom ? `+ ${row.id}  (custom)` : row.id}`}
            </Text>
          );
        })
      )}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>{manual ? `Model ID: ${query}` : `Search: ${query}`}</Text>
        {!manual && models !== null && rows.length > 0 ? (
          <Text dimColor>{active + 1}/{rows.length}</Text>
        ) : null}
      </Box>
      <WindowHint shown={viewSize} total={rows.length} />
      <Text dimColor>
        {config.provider === "openrouter"
          ? "↑↓ select · ctrl+f pin/unpin ★ · enter choose · type any model ID for + row · esc close"
          : "↑↓ select · enter choose · esc close"}
      </Text>
    </Overlay>
  );
}
