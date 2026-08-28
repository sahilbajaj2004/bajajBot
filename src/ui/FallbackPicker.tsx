import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import type { Config } from "../config/types.js";
import { fetchModels, orderModels, type ModelInfo } from "../provider/models.js";
import { WindowHint, useWindow } from "./ModelPicker.js";
import { Overlay } from "./Overlay.js";
import { theme } from "./theme.js";

interface Row {
  kind: "chain" | "profile" | "model";
  id: string;
  label: string;
}

function entryLabel(entry: string): string {
  const name = entry.slice("profile:".length);
  return entry.toLowerCase().startsWith("profile:") ? `⇶ ${name}` : entry;
}

export function FallbackPicker({
  config,
  onUpsert,
  onClose,
}: {
  config: Config;
  onUpsert: (next: string[]) => void;
  onClose: () => void;
}) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchModels(config.baseUrl, config.apiKey)
      .then((list) => !cancelled && setModels(list))
      .catch(() => !cancelled && setModels([]));
    return () => {
      cancelled = true;
    };
  }, [config]);

  const chain: Row[] = (config.fallbackModels ?? []).map((entry) => ({
    kind: "chain",
    id: entry,
    label: `${entryLabel(entry)}  · in chain`,
  }));
  const chainIds = new Set(
    (config.fallbackModels ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  );
  const profiles: Row[] = Object.entries(config.profiles ?? {})
    .filter(([name]) => !chainIds.has(`profile:${name.toLowerCase()}`))
    .map(([name, profile]) => ({ kind: "profile", id: `profile:${name}`, label: `⇶ ${profile.defaultModel} (${name})` }));
  const trimmed = query.trim();
  const candidates: Row[] = (orderModels(models ?? [], config.favoriteModels) ?? [])
    .filter((entry) => !chainIds.has(entry.id.toLowerCase()))
    .filter((entry) => entry.id.toLowerCase().includes(trimmed.toLowerCase()))
    .map((entry) => ({ kind: "model", id: entry.id, label: entry.id }));

  const rows: Row[] = [...chain, ...profiles, ...candidates];
  const active = Math.min(selected, Math.max(0, rows.length - 1));
  const { viewSize, start } = useWindow(rows.length, active);
  const visible = rows.slice(start, start + viewSize);
  const reachedEnd = candidates.length + profiles.length === 0;

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (key.upArrow) return rows.length > 0 ? setSelected(Math.max(0, active - 1)) : undefined;
    if (key.downArrow) return rows.length > 0 ? setSelected(Math.min(rows.length - 1, active + 1)) : undefined;
    if (key.pageUp) return rows.length > 0 ? setSelected(0) : undefined;
    if (key.pageDown) return rows.length > 0 ? setSelected(rows.length - 1) : undefined;
    if (key.ctrl && input?.toLowerCase() === "d") {
      const next = (config.fallbackModels ?? []).slice(0, -1);
      onUpsert(next);
      setSelected(0);
      return;
    }
    if (key.return) {
      const row = rows[active];
      if (!row || row.kind === "chain") return;
      const next = [...(config.fallbackModels ?? []), row.id];
      onUpsert(next);
      setSelected(Math.min(active + 1, rows.length - 1));
      return;
    }
    if (key.backspace || key.delete) return setQuery((value) => value.slice(0, -1));
    if (key.ctrl || key.meta || !input) return;
    setQuery((value) => value + input);
    setSelected(0);
  });

  const chainCount = chain.length;
  return (
    <Overlay title={`Fallback chain · ${chainCount} model${chainCount === 1 ? "" : "s"}`}>
      {chain.length === 0 ? (
        <Text dimColor>{"  Chain is empty — pick models/profiles below to add."}</Text>
      ) : (
        <Text dimColor>{`  ${chain.map((row) => entryLabel(row.id)).join(" → ")}`}</Text>
      )}
      <Text> </Text>
      {models === null ? (
        <Text dimColor>Loading models…</Text>
      ) : rows.length === 0 ? (
        <Text dimColor>No candidates match "{query}".</Text>
      ) : (
        visible.map((row, index) => {
          const isActive = start + index === active;
          return (
            <Text key={`${row.kind}:${row.id}`} bold={isActive} color={isActive ? theme.accent : undefined}>
              {` ${isActive ? "›" : " "}${row.label}`}
            </Text>
          );
        })
      )}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>{`Search: ${query}`}</Text>
        {models !== null && rows.length > 0 ? <Text dimColor>{`${active + 1}/${rows.length}`}</Text> : null}
      </Box>
      <WindowHint shown={viewSize} total={rows.length} />
      <Text dimColor>
        {reachedEnd
          ? "↑↓ select · enter re-add · ctrl+d removes last · esc done"
          : "↑↓ select · enter add · type to filter · ctrl+d removes last · esc done"}
      </Text>
    </Overlay>
  );
}