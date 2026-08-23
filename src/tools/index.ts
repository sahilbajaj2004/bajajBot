import type { ToolArgs, ToolContext, ToolDef, ToolSchema } from "./types.js";
import { deletePath, editFile, listDir, readFile, writeFile } from "./fs.js";
import { runCommand } from "./shell.js";

export const TOOLS: ToolDef[] = [readFile, listDir, writeFile, editFile, deletePath, runCommand];

export function toolSchemas(): ToolSchema[] {
  return TOOLS.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export function systemPrompt(cwd: string): string {
  return [
    "You are bajajbot, an AI coding assistant running in the user's terminal.",
    `Working directory: ${cwd}`,
    "You can use the provided tools to read files, explore directories, create and edit files, delete paths, and run shell commands.",
    "Paths are relative to the working directory. Prefer edit_file with a unique snippet for small changes.",
    "The UI asks the user for confirmation before risky actions; do not ask for permission yourself.",
    "After using tools, summarize what you did concisely.",
  ].join("\n");
}

export function parseToolArgs(raw: string): ToolArgs {
  try {
    const parsed = JSON.parse(raw || "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as ToolArgs) : {};
  } catch {
    return {};
  }
}

export async function executeTool(call: { name: string; args: string }, ctx: ToolContext): Promise<string> {
  const def = TOOLS.find((tool) => tool.name === call.name);
  if (!def) return `Error: unknown tool "${call.name}"`;
  const args = parseToolArgs(call.args);
  if (def.risky) {
    const ok = await ctx.confirm(`${def.name} ${def.summary(args)}`, describe(args));
    if (!ok) return "User denied this action.";
  }
  try {
    return await def.execute(args, ctx);
  } catch (cause) {
    return `Error: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

function describe(args: ToolArgs): string {
  const parts = Object.entries(args).map(([key, value]) => `${key}: ${String(value ?? "").slice(0, 120)}`);
  return parts.join("\n") || "(no arguments)";
}
