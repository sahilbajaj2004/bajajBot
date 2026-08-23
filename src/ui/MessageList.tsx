import { Box, Text } from "ink";
import type { Message } from "../session/types.js";
import { theme } from "./theme.js";
import { Markdown } from "./Markdown.js";

function argPreview(call: NonNullable<Message["toolCalls"]>[number]): string {
  try {
    const args = JSON.parse(call.args || "{}") as Record<string, unknown>;
    const first = Object.values(args)[0];
    return typeof first === "string" ? first.slice(0, 70) : "";
  } catch {
    return "";
  }
}

function ToolLines({ message }: { message: Message }) {
  if (message.role === "assistant") {
    return (
      <>
        {(message.toolCalls ?? []).map((call) => (
          <Text key={call.id} dimColor>
            {"  ⚙ "}
            {call.name}
            {argPreview(call) ? ` ${argPreview(call)}` : ""}
          </Text>
        ))}
      </>
    );
  }
  const failed = message.content.startsWith("Error:") || message.content === "User denied this action.";
  const line = message.content.split("\n").find((entry) => entry.trim().length > 0) ?? "(no output)";
  return (
    <Text dimColor>
      {"  ↳ "}
      <Text color={failed ? theme.danger : undefined}>{failed ? "✗" : "✓"}</Text>{" "}
      {line.slice(0, 100)}
    </Text>
  );
}

function MessageRow({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <Box marginTop={1}>
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Text>{message.content}</Text>
        </Box>
      </Box>
    );
  }
  if (message.role === "system") return null;
  const hasToolLines =
    message.role === "tool" || (message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0);
  return (
    <Box marginTop={1} flexDirection="column">
      {hasToolLines ? <ToolLines message={message} /> : null}
      {message.role === "assistant" && message.content ? <Markdown content={message.content} /> : null}
    </Box>
  );
}

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <Box flexDirection="column">
      {messages.map((message, index) => (
        <MessageRow key={`${index}-${message.timestamp}`} message={message} />
      ))}
    </Box>
  );
}

function messageHeight(message: Message, columns: number): number {
  if (message.role === "tool") return 2;
  const inner = Math.max(Math.floor(columns * 0.85) - 4, 16);
  const wrapped = message.content.split("\n").reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / inner)),
    0,
  );
  return wrapped + 3 + (message.role === "assistant" ? (message.toolCalls?.length ?? 0) : 0);
}

export interface ScrollWindow {
  picked: Message[];
  hiddenAbove: number;
}

function trimmedCopy(message: Message, maxLines: number): Message {
  const lines = message.content.split("\n");
  if (lines.length <= maxLines) return message;
  return { ...message, content: `…\n${lines.slice(-maxLines).join("\n")}` };
}

/** Pick the messages that fit `budget` lines, starting `offset` lines back from the newest. */
export function scrolledWindow(messages: Message[], columns: number, budget: number, offset: number): ScrollWindow {
  const list = messages.filter((m) => m.role !== "system");
  const heights = list.map((m) => messageHeight(m, columns));
  const total = heights.reduce((sum, h) => sum + h, 0);
  const target = Math.max(0, Math.min(offset, Math.max(0, total - budget)));

  let skipped = 0;
  let cut = list.length;
  for (let i = list.length - 1; i >= 0; i--) {
    if (skipped >= target) break;
    skipped += heights[i];
    cut = i;
  }

  const picked: Message[] = [];
  let used = 0;
  for (let i = cut - 1; i >= 0; i--) {
    if (picked.length === 0 && heights[i] > budget) {
      const trimmed = trimmedCopy(list[i], Math.max(budget - 4, 2));
      picked.unshift(trimmed);
      used = budget;
      break;
    }
    if (picked.length > 0 && used + heights[i] > budget) break;
    picked.unshift(list[i]);
    used += heights[i];
  }
  return { picked, hiddenAbove: cut > 0 ? Math.max(target, 0) : 0 };
}
