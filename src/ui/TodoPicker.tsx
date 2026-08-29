import { Text, useInput } from "ink";
import { useState } from "react";
import type { TodoItem } from "../tools/todos.js";
import { WindowHint, useWindow } from "./ModelPicker.js";
import { Overlay } from "./Overlay.js";
import { theme } from "./theme.js";

type Mode = "list" | "add";

export function TodoPicker({
  items,
  onUpsert,
  onClose,
}: {
  items: TodoItem[];
  onUpsert: (next: TodoItem[]) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("list");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const needle = query.trim().toLowerCase();
  const filtered = items.filter((item) => !needle || `${item.text} ${item.done ? "done" : ""}`.toLowerCase().includes(needle));
  const rows = mode === "list" ? filtered : [text];
  const { viewSize, start } = useWindow(Math.max(rows.length, 1), selected);
  const visible = rows.slice(start, start + viewSize);

  useInput((input, key) => {
    if (key.escape) {
      if (mode === "add") return setMode("list");
      return onClose();
    }
    if (mode === "add") {
      if (key.backspace || key.delete) return setText((value) => value.slice(0, -1));
      if (key.return) {
        const trimmed = text.trim();
        if (trimmed) {
          onUpsert([...items, { text: trimmed.slice(0, 300), done: false }]);
          setText("");
          setMode("list");
          setQuery("");
          setSelected(items.length);
        }
        return;
      }
      if (!key.ctrl && !key.meta && input) setText((value) => value + input);
      return;
    }
    if (key.return || (input === " " && filtered[selected])) {
      const target = filtered[selected];
      if (!target) return;
      const next = items.map((item) => (item === target ? { ...item, done: !item.done } : item));
      onUpsert(next);
      return;
    }
    if (key.ctrl && input?.toLowerCase() === "d") {
      const target = filtered[selected];
      if (target) {
        onUpsert(items.filter((item) => item !== target));
        setSelected(Math.max(0, selected - 1));
      }
      return;
    }
    if (input?.toLowerCase() === "c") {
      const next = items.filter((item) => !item.done);
      onUpsert(next);
      setSelected(Math.max(0, selected - 1));
      setQuery("");
      return;
    }
    if (input?.toLowerCase() === "a") {
      setText("");
      setMode("add");
      return;
    }
    if (key.upArrow) return setSelected(Math.max(0, selected - 1));
    if (key.downArrow) return setSelected(Math.min(rows.length - 1, selected + 1));
    if (key.backspace || key.delete) return setQuery((value) => value.slice(0, -1));
    if (!key.ctrl && !key.meta && input) {
      setQuery((value) => value + input);
      setSelected(0);
    }
  });

  const open = items.filter((item) => !item.done).length;

  return (
    <Overlay title={`Todos · ${open} open of ${items.length}`}>
      {mode === "list" ? (
        items.length === 0 ? (
          <Text dimColor>{"  No todos for this project yet — press a to add one."}</Text>
        ) : rows.length === 0 ? (
          <Text dimColor>{`  No todos match "${query}".`}</Text>
        ) : (
          visible.map((row, index) => {
            const at = start + index;
            const done = filtered[at]?.done ?? false;
            return (
              <Text key={`${at}:${row}`} bold={at === selected} color={done ? theme.success : at === selected ? theme.accent : undefined}>
                {` ${at === selected ? "›" : " "}${done ? "✓" : "○"} ${row}`}
              </Text>
            );
          })
        )
      ) : (
        <>
          <Text> </Text>
          <Text bold color={theme.accent}>{`  › ${text}${text ? "" : "█"}`}</Text>
          <Text dimColor>  Type a task — ↵ adds it · esc back.</Text>
        </>
      )}
      <Text> </Text>
      <Text dimColor>Filter: {query || "all"}</Text>
      <WindowHint shown={viewSize} total={rows.length} />
      <Text dimColor>
        {mode === "add"
          ? "  type task… ↵ save · esc back"
          : "  ↵/space toggle · ⌃d delete · c clears done · a adds · esc done"}
      </Text>
    </Overlay>
  );
}