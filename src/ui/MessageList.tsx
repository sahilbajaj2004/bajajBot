import { Fragment, type ReactNode } from "react";
import { Box, Text } from "ink";
import type { Message } from "../session/types.js";
import { theme } from "./theme.js";
import { renderMarkdown } from "./Markdown.js";
import { segmentLine } from "./select.js";

export interface ChatLine {
  key: string;
  node: ReactNode;
  /** Plain (ANSI-stripped) text of this line, used for selection + copy. */
  text: string;
  /** Index of the message this line belongs to (within the visible message list). */
  messageIndex: number;
}

/** Column range of a line covered by an active selection (undefined = not covered). */
export interface Highlight {
  left: number;
  right: number;
  full: boolean;
}

export function wrapText(text: string, width: number): string[] {
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

/**
 * Top/bottom border strings for a chat bubble that exactly fit the content
 * width. Labels (e.g. "you") ride the top border when they fit; otherwise the
 * classic plain border is used so the two lines always align.
 */
function bubbleBox(contentWidth: number, label: string): { top: string; bottom: string } {
  if (label.length > 0 && contentWidth >= label.length + 2) {
    return {
      top: `╭─ ${label} ${"─".repeat(contentWidth - label.length - 1)}╮`,
      bottom: `╰${"─".repeat(contentWidth + 2)}╯`,
    };
  }
  return {
    top: `╭${"─".repeat(contentWidth + 2)}╮`,
    bottom: `╰${"─".repeat(contentWidth + 2)}╯`,
  };
}

/** Build the flat scrollback of single-line blocks the chat viewport renders from. */
export function buildChatLines(messages: Message[], columns: number): ChatLine[] {
  const inner = Math.max(columns - 6, 16);
  const lines: ChatLine[] = [];
  let seq = 0;
  let currentMessage = 0;
  const push = (node: ReactNode, text: string): void => {
    lines.push({ key: `l${seq}`, node, text, messageIndex: currentMessage });
    seq += 1;
  };

  const visible = messages.filter((message) => message.role !== "system");
  visible.forEach((message, index) => {
    currentMessage = index;
    if (index > 0) push(<Text> </Text>, " ");

    if (message.role === "user") {
      const wrapped = wrapText(message.content, inner);
      const contentWidth = Math.max(...wrapped.map((line) => line.length), 1);
      const { top, bottom } = bubbleBox(contentWidth, "you");
      push(<Text color="gray">{top}</Text>, top);
      for (const line of wrapped) {
        push(
          <Text>
            <Text color="gray">{"│ "}</Text>
            <Text bold>{line.padEnd(contentWidth)}</Text>
            <Text color="gray">{" │"}</Text>
          </Text>,
          `│ ${line.padEnd(contentWidth)} │`,
        );
      }
      push(<Text color="gray">{bottom}</Text>, bottom);
      return;
    }

    if (message.subagent) {
      const wrapped = wrapText(message.content, inner);
      const contentWidth = Math.max(...wrapped.map((line) => line.length), 1);
      const { top, bottom } = bubbleBox(contentWidth, "subagent");
      push(<Text color={theme.accent}>{top}</Text>, top);
      for (const line of wrapped) {
        push(
          <Text>
            <Text color={theme.accent}>{"│ "}</Text>
            <Text italic>{line.padEnd(contentWidth)}</Text>
            <Text color={theme.accent}>{" │"}</Text>
          </Text>,
          `│ ${line.padEnd(contentWidth)} │`,
        );
      }
      push(<Text color={theme.accent}>{bottom}</Text>, bottom);
      return;
    }

    if (message.role === "tool") {
      const failed =
        message.content.startsWith("Error:") || message.content === "User denied this action.";
      const first = message.content.split("\n").find((entry) => entry.trim().length > 0) ?? "(no output)";
      const plain = `  ↳ ${failed ? "✗" : "✓"} ${first.slice(0, 100)}`;
      push(
        <Text dimColor>
          {"  ↳ "}
          <Text color={failed ? theme.danger : undefined}>{failed ? "✗" : "✓"}</Text> {first.slice(0, 100)}
        </Text>,
        plain,
      );
      return;
    }

    for (const call of message.toolCalls ?? []) {
      const preview = argPreview(call);
      const plain = `  ⚙ ${call.name}${preview ? ` ${preview}` : ""}`;
      push(
        <Text dimColor>
          {"  ⚙ "}
          {call.name}
          {preview ? ` ${preview}` : ""}
        </Text>,
        plain,
      );
    }
    if (message.content) {
      for (const line of renderMarkdown(message.content, Math.max(columns - 4, 20)).split("\n")) {
        push(<Text>{line.length > 0 ? line : " "}</Text>, line.length > 0 ? line : " ");
      }
    }
  });

  return lines;
}

export function ChatViewport({
  lines,
  highlight,
  width,
}: {
  lines: ChatLine[];
  highlight?: Record<number, Highlight>;
  width: number;
}) {
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => {
        const range = highlight?.[index];
        if (!range) return <Fragment key={line.key}>{line.node}</Fragment>;
        return (
          <Fragment key={line.key}>
            {segmentLine(line.text, range.left, range.right, width).map((segment, part) =>
              segment.hl ? (
                <Text key={part} backgroundColor={theme.accent} color="black">
                  {segment.text}
                </Text>
              ) : (
                <Text key={part} dimColor={!range.full || undefined}>
                  {segment.text}
                </Text>
              ),
            )}
          </Fragment>
        );
      })}
    </Box>
  );
}
