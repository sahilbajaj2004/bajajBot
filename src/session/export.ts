import type { Message } from "./types.js";

/** Render a chat transcript as readable markdown (tool output condensed to one line). */
export function toMarkdown(model: string, messages: Message[]): string {
  const lines: string[] = [
    "# bajajbot chat",
    "",
    `- Model: \`${model}\``,
    `- Exported: ${new Date().toISOString()}`,
    "",
  ];
  for (const message of messages) {
    if (message.role === "user") {
      lines.push("## You", "", message.content.trim(), "");
    } else if (message.role === "assistant") {
      lines.push("## Assistant", "", message.content.trim(), "");
    } else {
      const first = message.content.split("\n").find((entry) => entry.trim().length > 0) ?? "(no output)";
      lines.push(`> ⚙ tool result: ${first.slice(0, 120)}`, "");
    }
  }
  return lines.join("\n");
}
