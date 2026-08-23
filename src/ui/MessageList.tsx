import { Fragment, type ReactNode } from "react";
import { Box, Text } from "ink";
import type { Message } from "../session/types.js";
import { theme } from "./theme.js";
import { renderMarkdown } from "./Markdown.js";

export interface ChatLine {
  key: string;
  node: ReactNode;
}

function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const rawWord of raw.split(" ")) {
      let word = rawWord;
      while (word.length > width) {
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

function argPreview(call: NonNullable<Message["toolCalls"]>[number]): string {
  try {
    const args = JSON.parse(call.args || "{}") as Record<string, unknown>;
    const first = Object.values(args)[0];
    return typeof first === "string" ? first.slice(0, 70) : "";
  } catch {
    return "";
  }
}

/** Build the flat scrollback of single-line blocks the chat viewport renders from. */
export function buildChatLines(messages: Message[], columns: number): ChatLine[] {
  const inner = Math.max(columns - 6, 16);
  const boxWidth = inner + 4;
  const top = `╭${"─".repeat(boxWidth - 2)}╮`;
  const bottom = `╰${"─".repeat(boxWidth - 2)}╯`;
  const lines: ChatLine[] = [];
  let seq = 0;
  const push = (node: ReactNode): void => {
    lines.push({ key: `l${seq}`, node });
    seq += 1;
  };

  const visible = messages.filter((message) => message.role !== "system");
  visible.forEach((message, index) => {
    if (index > 0) push(<Text> </Text>);

    if (message.role === "user") {
      push(
        <Text color="gray">
          <Text>{top}</Text>
        </Text>,
      );
      for (const line of wrapText(message.content, inner)) {
        push(
          <Text>
            <Text color="gray">{"│ "}</Text>
            <Text>{line.padEnd(inner)}</Text>
            <Text color="gray">{" │"}</Text>
          </Text>,
        );
      }
      push(
        <Text color="gray">
          <Text>{bottom}</Text>
        </Text>,
      );
      return;
    }

    if (message.role === "tool") {
      const failed =
        message.content.startsWith("Error:") || message.content === "User denied this action.";
      const first = message.content.split("\n").find((entry) => entry.trim().length > 0) ?? "(no output)";
      push(
        <Text dimColor>
          {"  ↳ "}
          <Text color={failed ? theme.danger : undefined}>{failed ? "✗" : "✓"}</Text> {first.slice(0, 100)}
        </Text>,
      );
      return;
    }

    for (const call of message.toolCalls ?? []) {
      const preview = argPreview(call);
      push(
        <Text dimColor>
          {"  ⚙ "}
          {call.name}
          {preview ? ` ${preview}` : ""}
        </Text>,
      );
    }
    if (message.content) {
      for (const line of renderMarkdown(message.content, Math.max(columns - 4, 20)).split("\n")) {
        push(<Text>{line.length > 0 ? line : " "}</Text>);
      }
    }
  });

  return lines;
}

export function ChatViewport({ lines }: { lines: ChatLine[] }) {
  return (
    <Box flexDirection="column">
      {lines.map((line) => (
        <Fragment key={line.key}>{line.node}</Fragment>
      ))}
    </Box>
  );
}
