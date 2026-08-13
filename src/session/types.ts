export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  messages: Message[];
}
