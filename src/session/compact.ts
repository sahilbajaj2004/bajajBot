import type { Config } from "../config/types.js";
import { completeChat } from "../provider/client.js";
import type { Message } from "./types.js";

export const DEFAULT_CONTEXT_TOKENS = 12_000;
const CHARS_PER_TOKEN = 4;
const KEEP_RECENT_MESSAGES = 8;
const MAX_TRANSCRIPT_CHARS = 80_000;

const SUMMARY_INSTRUCTION = [
  "Summarize this conversation between a user and a terminal coding assistant so work can continue seamlessly.",
  "Capture: the user's goal, decisions made, files created or modified (with paths), important errors hit, and immediate next steps.",
  "Write at most 250 words. Reply with only the summary.",
].join(" ");

export function tokenLimit(config: Config): number {
  return typeof config.contextTokens === "number" && config.contextTokens > 0 ? config.contextTokens : DEFAULT_CONTEXT_TOKENS;
}

export function estimateTokens(messages: Message[]): number {
  return Math.ceil(messages.reduce((sum, message) => sum + message.content.length, 0) / CHARS_PER_TOKEN);
}

/**
 * Index where history can be split without separating an assistant tool_calls
 * message from its tool results: always immediately before a user message,
 * keeping at least keepRecent trailing messages verbatim. Null when no safe
 * split exists.
 */
export function compactionCut(messages: Message[], keepRecent = KEEP_RECENT_MESSAGES): number | null {
  if (messages.length <= keepRecent) return null;
  let index = messages.length - keepRecent;
  while (index < messages.length && messages[index].role !== "user") index++;
  return index < messages.length ? index : null;
}

/**
 * When the conversation exceeds the configured context budget, replace every
 * message before a safe cut with a single AI-written summary message. Returns
 * null when under budget, no safe cut exists, or summarization fails — the
 * caller keeps the full history in those cases.
 */
export async function compactMessages(
  config: Config,
  messages: Message[],
  options: { retryDelays?: number[] } = {},
): Promise<{ messages: Message[]; removed: number } | null> {
  if (estimateTokens(messages) <= tokenLimit(config)) return null;
  const cut = compactionCut(messages);
  if (cut === null || cut < 1) return null;

  const old = messages.slice(0, cut);
  const recent = messages.slice(cut);
  let transcript = old.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  if (transcript.length > MAX_TRANSCRIPT_CHARS) transcript = `…\n\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`;

  let summary: string;
  try {
    summary = (
      await completeChat(
        config,
        [
          {
            role: "user",
            content: `${SUMMARY_INSTRUCTION}\n\n<conversation>\n${transcript}\n</conversation>`,
            timestamp: new Date().toISOString(),
          },
        ],
        options,
      )
    ).trim();
  } catch {
    return null;
  }
  if (!summary) return null;

  const bridge: Message = {
    role: "user",
    content: `[Earlier conversation summarized to save context]\n${summary}\n[Summary end — the conversation continues below]`,
    timestamp: new Date().toISOString(),
  };
  return { messages: [bridge, ...recent], removed: old.length };
}
