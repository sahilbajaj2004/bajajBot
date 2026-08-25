import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolArgs, ToolContext, ToolDef } from "./types.js";

const MAX_SKILL_CHARS = 40_000;
const SKILL_DIR = ".bajajbot/skills";

export type SkillOrigin = string;

export interface Skill {
  /** File or folder name — used as the load_skill argument. */
  name: string;
  description: string;
  path: string;
  /** Where the skill came from: "project" or a tilde path like "~/.claude". */
  origin: SkillOrigin;
}

export interface SkillSource {
  dir: string;
  origin: SkillOrigin;
}

function parseFrontmatter(content: string): { description?: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { body: content };
  const frontmatter = match[1];
  const body = content.slice(match[0].length);
  const described = /^description:\s*(.+)$/m.exec(frontmatter);
  return { description: described?.[1]?.trim(), body };
}

function fallbackDescription(body: string): string {
  for (const line of body.split("\n")) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    return text.length > 90 ? `${text.slice(0, 89)}…` : text;
  }
  return "(no description)";
}

function readSkill(path: string, name: string, origin: SkillOrigin): Skill | null {
  try {
    const raw = readFileSync(path, "utf8");
    const { description, body } = parseFrontmatter(raw);
    return { name, description: description || fallbackDescription(body), path, origin };
  } catch {
    return null;
  }
}

/** Skills from the given sources, earlier sources win on name conflicts. */
export function listSkillsFrom(sources: SkillSource[]): Skill[] {
  const byName = new Map<string, Skill>();
  for (const { dir, origin } of sources) {
    if (!existsSync(dir)) continue;
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      // Two layouts: bajajbot's <name>.md files and agent-style <name>/SKILL.md dirs.
      let name: string;
      let path: string;
      if (item.isFile() && /\.md$/i.test(item.name)) {
        name = item.name.replace(/\.md$/i, "");
        path = join(dir, item.name);
      } else {
        const candidate = join(dir, item.name, "SKILL.md");
        try {
          if (!statSync(join(dir, item.name)).isDirectory() || !existsSync(candidate)) continue;
        } catch {
          continue;
        }
        name = item.name;
        path = candidate;
      }
      if (byName.has(name)) continue;
      const skill = readSkill(path, name, origin);
      if (skill) byName.set(name, skill);
    }
  }
  return [...byName.values()];
}

/**
 * Every place skills can live: the project's .bajajbot/skills (wins), then
 * native and third-party global locations — ~/.bajajbot, ~/.claude,
 * ~/.agents and ~/.codex — so playbooks installed for other coding agents
 * work here too.
 */
export function listSkills(cwd: string): Skill[] {
  const home = homedir();
  return listSkillsFrom([
    { dir: join(cwd, SKILL_DIR), origin: "project" },
    { dir: join(cwd, ".claude", "skills"), origin: "project" },
    { dir: join(home, SKILL_DIR), origin: "~/.bajajbot" },
    { dir: join(home, ".claude", "skills"), origin: "~/.claude" },
    { dir: join(home, ".agents", "skills"), origin: "~/.agents" },
    { dir: join(home, ".codex", "skills"), origin: "~/.codex" },
  ]);
}

function resolveSkill(args: ToolArgs, ctx: ToolContext): { name: string; path: string } {
  const name = String(args.name ?? "").trim();
  if (!name) throw new Error("Missing required argument: name");
  const skill = listSkills(ctx.cwd).find((entry) => entry.name === name);
  if (!skill) {
    const known = listSkills(ctx.cwd).map((entry) => entry.name).join(", ") || "(none)";
    throw new Error(`Unknown skill "${name}". Available: ${known}`);
  }
  return { name, path: skill.path };
}

export const listSkillsTool: ToolDef = {
  name: "list_skills",
  description: "List the skill playbooks available to load (name + description).",
  risky: false,
  parameters: { type: "object", properties: {} },
  summary: () => "",
  execute: (_args, ctx) => {
    const skills = listSkills(ctx.cwd);
    if (!skills.length) {
      return "No skills installed. Add .md files (or <name>/SKILL.md folders) to <project>/.bajajbot/skills, ~/.bajajbot/skills, ~/.claude/skills, ~/.agents/skills or ~/.codex/skills.";
    }
    return skills.map((skill) => `${skill.name}: ${skill.description}`).join("\n");
  },
};

export const loadSkillTool: ToolDef = {
  name: "load_skill",
  description: "Load a skill playbook's full instructions by name (see list_skills).",
  risky: false,
  parameters: {
    type: "object",
    properties: { name: { type: "string", description: "Skill name, e.g. \"deploy\"" } },
    required: ["name"],
  },
  summary: (args) => String(args.name ?? ""),
  execute: (args, ctx) => {
    const { path } = resolveSkill(args, ctx);
    return readSkillFile(path);
  },
}

/** Read a skill's markdown with the shared size cap. */
export function readSkillFile(path: string): string {
  let content = readFileSync(path, "utf8");
  if (content.length > MAX_SKILL_CHARS) {
    content = `${content.slice(0, MAX_SKILL_CHARS)}\n… truncated (${content.length} chars total)`;
  }
  return content.trim() || "(empty skill)";
};
