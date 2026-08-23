import { Text, useStdout } from "ink";
import { useMemo } from "react";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

export function Markdown({ content }: { content: string }) {
  const { stdout } = useStdout();
  const columns = Math.max(stdout.columns ?? 80, 20);
  const rendered = useMemo(() => {
    try {
      const marked = new Marked(markedTerminal({ width: columns }));
      return (marked.parse(content) as string).trimEnd();
    } catch {
      return content;
    }
  }, [content, columns]);
  return <Text>{rendered}</Text>;
}
