import { Box, Text } from "ink";
import type { Message } from "../session/types.js";

export function MessageList({ messages }: { messages: Message[] }) {
  return <Box flexDirection="column" gap={1}>
    {messages.map((message, index) => (
      <Box key={`${message.timestamp}-${index}`} flexDirection="column">
        <Text bold color={message.role === "user" ? "cyan" : "green"}>
          {message.role === "user" ? "You" : "BajajBot"}
        </Text>
        <Text wrap="wrap">{message.content}</Text>
      </Box>
    ))}
  </Box>;
}
