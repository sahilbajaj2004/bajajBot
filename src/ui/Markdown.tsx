import { Text } from "ink";
import { useMemo } from "react";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

const marked = new Marked(markedTerminal());

export function Markdown({ content }: { content: string }) {
  const rendered = useMemo(() => {
    try {
      return (marked.parse(content) as string).trimEnd();
    } catch {
      return content;
    }
  }, [content]);
  return <Text>{rendered}</Text>;
}
