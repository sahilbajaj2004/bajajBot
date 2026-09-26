import type { Config } from "../config/types.js";
import { isAbortError, streamChat } from "../provider/client.js";
import { executeTool, systemPrompt, toolSchemas } from "../tools/index.js";
import type { ToolCall } from "../session/types.js";
import type { Message } from "../session/types.js";
import type { ToolContext } from "../tools/types.js";

export interface PrintTurnOptions {
  onToken?: (token: string) => void;
  signal?: AbortSignal;
  maxRounds?: number;
  /** Return true to allow a risky action; default denies everything. */
  confirm?: (title: string, detail: string) => Promise<boolean>;
}

export interface PrintTurnResult {
  /** The assistant's complete visible answer across all rounds. */
  reply: string;
  /** Risky actions that were blocked because nothing can be confirmed. */
  denied: string[];
}

/**
 * One full agent turn without any UI: streams the answer, runs allowed tool
 * rounds, returns the final text. Used by `bajajbot -p`.
 */
export async function runPrintTurn(config: Config, prompt: string, options: PrintTurnOptions = {}): Promise<PrintTurnResult> {
  const onToken = options.onToken ?? (() => {});
  const denied: string[] = [];
  const parts: string[] = [];
  let convo: Message[] = [
    { role: "system", content: systemPrompt(process.cwd()), timestamp: new Date().toISOString() },
    { role: "user", content: prompt, timestamp: new Date().toISOString() },
  ];
  const ctx: ToolContext = {
    cwd: process.cwd(),
    confirm: options.confirm ?? (async (title) => {
      denied.push(title);
      return false;
    }),
  };
  const maxRounds = options.maxRounds ?? 10;

  for (let round = 0; round < maxRounds; round++) {
    let roundText = "";
    let calls: ToolCall[] | undefined;
    try {
      for await (const token of streamChat(config, convo, {
        tools: toolSchemas(),
        signal: options.signal,
        onToolCalls: (received) => {
          calls = received;
        },
      })) {
        roundText += token;
        onToken(token);
      }
    } catch (cause) {
      if (isAbortError(cause)) break;
      throw cause;
    }
    if (roundText) parts.push(roundText);
    if (!calls?.length) break;

    convo = [
      ...convo,
      { role: "assistant", content: roundText, timestamp: new Date().toISOString(), toolCalls: calls },
    ];
    for (const call of calls) {
      const output = await executeTool({ name: call.name, args: call.args }, ctx);
      convo = [
        ...convo,
        { role: "tool", content: output.slice(0, 20_000), timestamp: new Date().toISOString(), toolCallId: call.id },
      ];
    }
  }

  return { reply: parts.join("\n\n"), denied };
}
