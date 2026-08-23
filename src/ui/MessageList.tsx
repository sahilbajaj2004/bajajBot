import { Box, Static, Text } from "ink";
import type { Message } from "../session/types.js";
import { Markdown } from "./Markdown.js";
import { theme } from "./theme.js";

function MessageRow({ message }: { message: Message }) {
  if (message.role === "system") return null;
  if (message.role === "user") {
    return (
      <Box marginTop={1}>
        <Text>
          <Text bold color={theme.accent}>You › </Text>
          {message.content}
        </Text>
      </Box>
    );
  }
  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold dimColor>BajajBot</Text>
      <Markdown content={message.content} />
    </Box>
  );
}

export function MessageHistory({ messages }: { messages: Message[] }) {
  return (
    <Static items={messages}>
      {(message, index) => <MessageRow key={`${index}-${message.timestamp}`} message={message} />}
    </Static>
  );
}
