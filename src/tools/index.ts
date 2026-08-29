import type { ToolArgs, ToolContext, ToolDef, ToolSchema } from "./types.js";
import { deletePath, editFile, listDir, readFile, writeFile } from "./fs.js";
import { runCommand } from "./shell.js";
import { searchFiles } from "./search.js";
import { fetchUrl, webSearchTool } from "./web.js";
import { listSkills, listSkillsTool, loadSkillTool } from "./skills.js";
import { setPlanTool } from "./plan.js";
import { instructionsBlock } from "./instructions.js";
import { memoryPromptBlock, memoryTool } from "./memory.js";
import { todosBlock, updateTodosTool } from "./todos.js";

export const TOOLS: ToolDef[] = [
  readFile,
  listDir,
  searchFiles,
  writeFile,
  editFile,
  deletePath,
  runCommand,
  fetchUrl,
  webSearchTool,
  listSkillsTool,
  loadSkillTool,
  setPlanTool,
  memoryTool,
  updateTodosTool,
];

export function toolSchemas(): ToolSchema[] {
  return TOOLS.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export function systemPrompt(cwd: string): string {
  const lines = [
    "You are bajajbot, an AI coding assistant running in the user's terminal.",
    `Working directory: ${cwd}`,
    "You can use the provided tools to read files, explore directories, search file contents with search_files, create and edit files, delete paths, run shell commands, and fetch web pages with fetch_url.",
    "Paths are relative to the working directory, but absolute paths (e.g. ~/Downloads or /tmp) work too — writing outside the project just asks for confirmation. Always prefer the file tools over shell tricks like cat heredocs. Use search_files to locate code before reading or editing files.",
    "The UI asks the user for confirmation before risky actions; do not ask for permission yourself.",
    "For any multi-step task, maintain a visible plan with set_plan: create it first, mark steps in_progress as you start and done as you finish, and add steps you discover along the way.",
    "You have persistent memory: when you learn something durable (user preferences, project conventions, decisions), save it with the memory tool so future sessions remember it.",
    "After using tools, summarize what you did concisely.",
  ];
  const memory = memoryPromptBlock();
  if (memory) lines.push(memory.trim());
  const skills = listSkills(cwd);
  if (skills.length) {
    lines.push(
      `Skill playbooks are available: ${skills.map((skill) => `${skill.name} (${skill.description})`).join("; ")}. When the user's request matches a skill, call load_skill with its name first and follow its instructions.`,
    );
  }
  return lines.join("\n") + instructionsBlock(cwd) + todosBlock(cwd);
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
