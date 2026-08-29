import { Text, useInput } from "ink";
import { useState } from "react";
import type { Snippet } from "../config/types.js";
import { expandSnippetText, normalizeSnippetName } from "../session/snippets.js";
import { WindowHint, useWindow } from "./ModelPicker.js";
import { Overlay } from "./Overlay.js";
import { theme } from "./theme.js";

type Mode = "list" | "name" | "text";

const MAX_PREVIEW = 60;

function snippetForm(name: string, text: string): string {
  const preview = text.replace(/\s+/g, " ").trim();
  return `${name}${preview ? " · " + preview.slice(0, MAX_PREVIEW) : ""}`;
}

export function SnippetPicker({
  snippets,
  onInsert,
  onUpsert,
  onClose,
}: {
  snippets: Snippet[];
  onInsert: (snippet: Snippet) => void;
  onUpsert: (next: Snippet[]) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("list");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const needle = query.trim().toLowerCase();
  const matches = (snippet: Snippet): boolean =>
    !needle || snippet.name.toLowerCase().includes(needle) || snippet.text.toLowerCase().includes(needle);
  const filtered = snippets.filter(matches);

  const listRows: string[] = [...filtered.map((snippet) => snippetForm(snippet.name, snippet.text)), "+ add snippet"];
  const addRow = filtered.length;
  const rowCount = mode === "list" ? listRows.length : 1;
  const { viewSize, start } = useWindow(Math.max(rowCount, 1), selected);
  const visible = listRows.slice(start, start + viewSize);

  const insertHere = (at: number): void => {
    const snippet = filtered[at];
    if (snippet) onInsert(snippet);
  };

  useInput((input, key) => {
    if (key.escape) {
      if (mode === "name") return setMode("list");
      if (mode === "text") return setMode("name");
      return onClose();
    }
    if (mode === "list") {
      if (key.ctrl && input?.toLowerCase() === "d") {
        const target = filtered[selected];
        if (target) {
          const next = snippets.filter((snippet) => snippet !== target && normalizeSnippetName(snippet.name) !== normalizeSnippetName(target.name));
          onUpsert(next.length ? next : []);
          setSelected(Math.max(0, selected - 1));
        }
        return;
      }
      if (key.return) {
        if (selected === addRow) {
          setName("");
          setMode("name");
        } else if (filtered[selected]) {
          insertHere(selected);
        }
        return;
      }
      if (key.upArrow) return setSelected(Math.max(0, selected - 1));
      if (key.downArrow) return setSelected(Math.min(listRows.length - 1, selected + 1));
      if (key.backspace || key.delete) return setQuery((value) => value.slice(0, -1));
      if (!key.ctrl && !key.meta && input) {
        setQuery((value) => value + input);
        setSelected(0);
      }
      return;
    }
    if (mode === "name") {
      if (key.backspace || key.delete) return setName((value) => value.slice(0, -1));
      if (key.return) {
        if (normalizeSnippetName(name)) setMode("text");
        return;
      }
      if (!key.ctrl && !key.meta && input) setName((value) => value + input);
      return;
    }
    if (mode === "text") {
      if (key.backspace || key.delete) return setText((value) => value.slice(0, -1));
      if (key.return) {
        const normalized = normalizeSnippetName(name);
        if (!normalized) return setMode("name");
        onUpsert([...snippets, { name: normalized, text: expandSnippetText(text) }]);
        setMode("list");
        setQuery("");
        setSelected(0);
        return;
      }
      if (!key.ctrl && !key.meta && input) setText((value) => value + input);
      return;
    }
  });

  const hint =
    mode === "list"
      ? "↑↓ select · ↵ insert into input · ⌃d delete · a adds · esc done"
      : mode === "name"
        ? "snippet name… ↵ next · esc back"
        : "snippet text… (\\n makes a newline) ↵ save · esc back";

  return (
    <Overlay title={`Prompt snippets · ${snippets.length}`}>
      {mode === "list" ? (
        snippets.length === 0 ? (
          <Text dimColor>{"  No snippets yet — press a to add one, or send a prompt then type /sn save <name>."}</Text>
        ) : listRows.length === 1 ? (
          <Text dimColor>{`  No snippet matches "${query}".`}</Text>
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
      {mode === "name" ? (
        <>
          <Text> </Text>
          <Text bold color={theme.accent}>{`  › ${name}${name ? "" : "█"}`}</Text>
          <Text dimColor>  Name for the snippet — ↵ to type the text.</Text>
        </>
      ) : null}
      {mode === "text" ? (
        <>
          <Text> </Text>
          <Text dimColor>{`  ${name}:`}</Text>
          <Text bold color={theme.accent}>{`  › ${text}${text ? "" : "█"}`}</Text>
          <Text dimColor>  Type the template (\n = newline) — ↵ saves it.</Text>
        </>
      ) : null}
      <Text> </Text>
      <Text dimColor>Filter: {query || "all"}</Text>
      <WindowHint shown={viewSize} total={listRows.length} />
      <Text dimColor>{hint}</Text>
    </Overlay>
  );
}