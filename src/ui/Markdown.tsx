import { Text, useStdout } from "ink";
import { useMemo } from "react";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { DEFAULT_COLUMNS } from "./theme.js";

/**
 * Streaming re-renders rebuild the whole chat ~20×/s; without this cache every
 * historical message would be re-parsed through marked each tick. Keyed by
 * columns+content, FIFO-evicted.
 */
const renderCache = new Map<string, string>();
const RENDER_CACHE_MAX = 120;

export function renderMarkdown(content: string, columns: number): string {
  const key = `${columns}\u0000${content}`;
  const hit = renderCache.get(key);
  if (hit !== undefined) return hit;
  let rendered: string;
  try {
    const marked = new Marked({ breaks: true }, markedTerminal({ width: Math.max(columns, 20) }));
    rendered = (marked.parse(content) as string).trimEnd();
  } catch {
    rendered = content;
  }
  if (renderCache.size >= RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  renderCache.set(key, rendered);
  return rendered;
}

export function Markdown({ content }: { content: string }) {
  const { stdout } = useStdout();
  const columns = Math.max(stdout.columns ?? DEFAULT_COLUMNS, 20);
  const rendered = useMemo(() => renderMarkdown(content, columns), [content, columns]);
  return <Text>{rendered}</Text>;
}
