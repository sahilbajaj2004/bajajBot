export interface ToolCall {
  id: string;
  name: string;
  args: string;
}

/** Multimodal content part (OpenAI-compatible chat format). */
export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  /** @path tokens from the user text whose file contents are sent to the model. */
  attachments?: string[];
  /** @path tokens pointing at image files, sent as vision input. */
  images?: string[];
  /** Populated at payload time for multimodal messages; preferred over content. */
  contentParts?: ContentPart[];
}

export interface SessionUsage {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  messages: Message[];
  /** Short human label derived from the first user message. */
  title?: string;
  /** Cumulative token/cost totals across the whole session. */
  usage?: SessionUsage;
}
