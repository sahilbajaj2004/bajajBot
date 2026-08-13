import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { Config } from "../config/types.js";
import { streamChat } from "../provider/client.js";
import type { Message } from "../session/types.js";
import type { Session } from "../session/types.js";
import { saveSession } from "../session/history.js";
import { InputBox } from "./InputBox.js";
import { MessageList } from "./MessageList.js";
import { StatusBar } from "./StatusBar.js";

export function App({ config, session }: { config: Config; session: Session }) {
  const [messages, setMessages] = useState<Message[]>(session.messages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");
  const [error, setError] = useState("");

  useInput((character, key) => {
    if (sending) return;
    if (key.return) void submit();
    else if (key.backspace || key.delete) setInput((value) => value.slice(0, -1));
    else if (!key.ctrl && !key.meta) setInput((value) => value + character);
  });

  async function submit() {
    const content = input.trim();
    if (!content) return;
    const userMessage: Message = { role: "user", content, timestamp: new Date().toISOString() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setSending(true);
    let reply = "";
    try {
      const flush = setInterval(() => setStreamingReply(reply), 50);
      try {
        for await (const token of streamChat(config, nextMessages)) reply += token;
      } finally {
        clearInterval(flush);
      }
      setStreamingReply(reply);
      const completed = [...nextMessages, { role: "assistant" as const, content: reply, timestamp: new Date().toISOString() }];
      setMessages(completed);
      saveSession({ ...session, updatedAt: new Date().toISOString(), messages: completed });
      setStreamingReply("");
    } catch (caught) {
      const partial = reply ? [...nextMessages, { role: "assistant" as const, content: reply, timestamp: new Date().toISOString() }] : nextMessages;
      setMessages(partial);
      saveSession({ ...session, updatedAt: new Date().toISOString(), messages: partial });
      setStreamingReply("");
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
    }
  }

  return <Box flexDirection="column" paddingX={1} gap={1}>
    <Text bold color="cyan">BajajBot</Text>
    <StatusBar config={config} sending={sending} />
    {messages.length ? <MessageList messages={streamingReply ? [...messages, {
      role: "assistant",
      content: streamingReply,
      timestamp: "streaming",
    }] : messages} /> : <Text dimColor>Enter message. Ctrl+C exits.</Text>}
    {error ? <Text color="red">{error}</Text> : null}
    <InputBox value={input} sending={sending} />
  </Box>;
}
