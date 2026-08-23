import { Text, useStdout } from "ink";
import { useMemo } from "react";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

export function renderMarkdown(content: string, columns: number): string {
  try {
    const marked = new Marked({ breaks: true }, markedTerminal({ width: Math.max(columns, 20) }));
    return (marked.parse(content) as string).trimEnd();
  } catch {
    return content;
  }
}

export function Markdown({ content }: { content: string }) {
  const { stdout } = useStdout();
  const columns = Math.max(stdout.columns ?? 80, 20);
  const rendered = useMemo(() => renderMarkdown(content, columns), [content, columns]);
  return <Text>{rendered}</Text>;
}
