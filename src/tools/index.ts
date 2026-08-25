import type { ToolArgs, ToolContext, ToolDef, ToolSchema } from "./types.js";
import { deletePath, editFile, listDir, readFile, writeFile } from "./fs.js";
import { runCommand } from "./shell.js";
import { searchFiles } from "./search.js";
import { fetchUrl } from "./web.js";

export const TOOLS: ToolDef[] = [readFile, listDir, searchFiles, writeFile, editFile, deletePath, runCommand, fetchUrl];

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
    "You can use the provided tools to read files, explore directories, search file contents with search_files, create and edit files, delete paths, run shell commands, and fetch web pages with fetch_url.",
    "Paths are relative to the working directory, but absolute paths (e.g. ~/Downloads or /tmp) work too — writing outside the project just asks for confirmation. Always prefer the file tools over shell tricks like cat heredocs. Use search_files to locate code before reading or editing files.",
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
    const ok = await ctx.confirm(`${def.name} ${def.summary(args)}`, def.detail?.(args, ctx) ?? describe(args));
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
