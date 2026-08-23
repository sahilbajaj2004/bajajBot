import { Box, Text } from "ink";
import type { Message } from "../session/types.js";
import { Markdown } from "./Markdown.js";

function wrappedLines(content: string, columns: number): number {
  const inner = Math.max(Math.floor(columns * 0.85) - 4, 16);
  return content.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / inner)), 0);
}

export function blockHeight(content: string, role: Message["role"], columns: number): number {
  return wrappedLines(content, columns) + (role === "user" ? 4 : 3);
}

export function visibleWindow(messages: Message[], columns: number, budget: number): Message[] {
  const picked: Message[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "system") continue;
    const height = blockHeight(message.content, message.role, columns);
    if (picked.length > 0 && used + height > budget) break;
    picked.push(message);
    used += height;
  }
  return picked.reverse();
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
  return (
    <Box marginTop={1} flexDirection="column">
      <Markdown content={message.content} />
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
