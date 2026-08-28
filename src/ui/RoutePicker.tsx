import { Text, useInput } from "ink";
import { useEffect, useState } from "react";
import type { Config, RouteRule } from "../config/types.js";
import { fetchModels, orderModels } from "../provider/models.js";
import { WindowHint, useWindow } from "./ModelPicker.js";
import { Overlay } from "./Overlay.js";
import { theme } from "./theme.js";

type Mode = "list" | "pattern" | "model";

function modelLabel(model: string): string {
  return model.startsWith("profile:") ? `⇶ ${model.slice("profile:".length)}` : model;
}

function patternLabel(pattern: string): string {
  return pattern.length >= 2 && pattern.startsWith("/") && pattern.endsWith("/")
    ? pattern
    : `"${pattern}"`;
}

export function RoutePicker({
  config,
  onUpsert,
  onClose,
}: {
  config: Config;
  onUpsert: (next: RouteRule[]) => void;
  onClose: () => void;
}) {
  const rules = config.routes ?? [];
  const [mode, setMode] = useState<Mode>("list");
  const [pattern, setPattern] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [models, setModels] = useState<Awaited<ReturnType<typeof fetchModels>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchModels(config.baseUrl, config.apiKey)
      .then((list) => !cancelled && setModels(list))
      .catch(() => !cancelled && setModels([]));
    return () => {
      cancelled = true;
    };
  }, [config]);

  useEffect(() => {
    setSelected(0);
    setQuery("");
  }, [mode]);

  const trimmed = query.trim().toLowerCase();
  const usedModels = new Set(rules.map((rule) => rule.model.toLowerCase()));
  const profileEntries = Object.entries(config.profiles ?? {})
    .filter(([name]) => !usedModels.has(`profile:${name.toLowerCase()}`))
    .filter(([name]) => `profile:${name}`.includes(trimmed));
  const modelEntries = (orderModels(models ?? [], config.favoriteModels) ?? [])
    .filter((entry) => !usedModels.has(entry.id.toLowerCase()))
    .filter((entry) => entry.id.toLowerCase().includes(trimmed));

  const listRows: string[] = [
    ...rules.map((rule) => `${rule.active === false ? "○" : "✓"} ${patternLabel(rule.pattern)} → ${modelLabel(rule.model)}`),
    "+ add rule",
  ];
  const addRow = rules.length;

  const toggleRule = (index: number): void => {
    if (index === addRow) {
      setPattern("");
      setMode("pattern");
      return;
    }
    onUpsert(
      rules.map((rule, at) => (at === index ? { ...rule, active: rule.active === false ? true : false } : rule)),
    );
  };

  const pickModel = (index: number): void => {
    const model =
      index < profileEntries.length
        ? `profile:${profileEntries[index][0]}`
        : modelEntries[index - profileEntries.length]?.id;
    if (!model) return;
    onUpsert([...rules, { pattern, model, active: true }]);
    setMode("list");
  };

  const rows =
    mode === "list"
      ? listRows
      : [...profileEntries.map(([name, profile]) => `⇶ ${name} · ${profile.defaultModel}`), ...modelEntries.map((entry) => entry.id)];
  const { viewSize, start } = useWindow(rows.length, selected);
  const visible = rows.slice(start, start + viewSize);

  useInput((input, key) => {
    if (key.escape) {
      if (mode === "pattern") return setMode("list");
      if (mode === "model") return setMode("pattern");
      return onClose();
    }
    if (mode === "list") {
      if (key.ctrl && input?.toLowerCase() === "d") {
        onUpsert(rules.filter((_, at) => at !== selected));
        setSelected(Math.max(0, selected - 1));
        return;
      }
      if (key.return) return toggleRule(Math.min(selected, addRow));
      if (key.upArrow) return setSelected(Math.max(0, selected - 1));
      if (key.downArrow) return setSelected(Math.min(rows.length - 1, selected + 1));
      if (input?.toLowerCase() === "a") {
        setPattern("");
        setMode("pattern");
      }
      return;
    }
    if (mode === "pattern") {
      if (key.backspace || key.delete) return setPattern((value) => value.slice(0, -1));
      if (key.return) {
        if (pattern.trim()) setMode("model");
        return;
      }
      if (!key.ctrl && !key.meta && input) setPattern((value) => value + input);
      return;
    }
    if (mode === "model") {
      if (key.return) return pickModel(Math.min(selected, rows.length - 1));
      if (key.upArrow) return setSelected(Math.max(0, selected - 1));
      if (key.downArrow) return setSelected(Math.min(rows.length - 1, selected + 1));
      if (key.backspace || key.delete) return setQuery((value) => value.slice(0, -1));
      if (!key.ctrl && !key.meta && input) {
        setQuery((value) => value + input);
        setSelected(0);
      }
    }
  });

  const hint =
    mode === "list"
      ? "↑↓ select · ↵ toggle on/off · ⌃d delete · a add rule · esc done"
      : mode === "pattern"
        ? "type the pattern (a keyword, or /regex/ ) · ↵ pick a model · esc back"
        : "↑↓ pick a model or ⇶ profile · type to filter · ↵ confirm · esc back";

  return (
    <Overlay title={`Smart routes · ${rules.filter((rule) => rule.active !== false).length} active of ${rules.length}`}>
      {mode === "list" ? (
        rows.length === 1 ? (
          <Text dimColor>{"  No routes yet — press a to add a keyword or /regex/ → model."}</Text>
        ) : (
          visible.map((row, index) => {
            const at = start + index;
            return (
              <Text key={`${at}:${row}`} bold={at === selected} color={at === selected ? theme.accent : undefined}>
                {` ${at === selected ? "›" : " "}${row}`}
              </Text>
            );
          })
        )
      ) : null}
      {mode === "pattern" ? (
        <>
          <Text> </Text>
          <Text bold color={theme.accent}>{`  › ${pattern}${pattern ? "" : "█"}`}</Text>
          <Text dimColor>  Pattern matches your message — a word is a keyword, /.../ is a regex.</Text>
        </>
      ) : null}
      {mode === "model" ? (
        <>
          <Text> </Text>
          <Text dimColor>{`  " ${pattern} " → pick a model:`}</Text>
          <Text> </Text>
          {models === null ? (
            <Text dimColor>Loading models…</Text>
          ) : rows.length === 0 ? (
            <Text dimColor>No models match "{query}".</Text>
          ) : (
            visible.map((row, index) => {
              const at = start + index;
              return (
                <Text key={`${at}:${row}`} bold={at === selected} color={at === selected ? theme.accent : undefined}>
                  {` ${at === selected ? "›" : " "}${row}`}
                </Text>
              );
            })
          )}
        </>
      ) : null}
      <Text> </Text>
      <WindowHint shown={viewSize} total={rows.length} />
      <Text dimColor>{hint}</Text>
    </Overlay>
  );
}