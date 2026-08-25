export interface ToolCall {
  id: string;
  name: string;
  args: string;
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  /** @path tokens from the user text whose file contents are sent to the model. */
  attachments?: string[];
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  messages: Message[];
}
