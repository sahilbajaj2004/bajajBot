import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { executeTool, systemPrompt, toolSchemas } from "../src/tools/index.js";
import { listSkillsFrom, readSkillFile } from "../src/tools/skills.js";
import type { ToolContext } from "../src/tools/types.js";

const root = mkdtempSync(join(tmpdir(), "bajajbot-skills-"));
after(() => rmSync(root, { recursive: true, force: true }));

const projectSkills = join(root, ".bajajbot", "skills");
const otherSkills = join(root, "other-skills");
mkdirSync(projectSkills, { recursive: true });
mkdirSync(otherSkills, { recursive: true });

writeFileSync(
  join(projectSkills, "deploy.md"),
  `---\ndescription: Ship the app to production\n---\n# Deploy\n\n1. Run tests\n2. npm run build\n3. npm run deploy\n`,
);
writeFileSync(
  join(otherSkills, "deploy.md"),
  "# Deploy\n\nWRONG copy — must be overridden by the project skill.\n",
);
writeFileSync(
  join(projectSkills, "review.md"),
  "# Review checklist\n\nCheck types, tests and error handling before approving.\n",
);
writeFileSync(join(projectSkills, "notes.txt"), "not a skill");

const ctx: ToolContext = { cwd: root, confirm: async () => true };

test("listSkillsFrom prefers earlier sources and only reads .md files", () => {
  const skills = listSkillsFrom([
    { dir: projectSkills, origin: "project" },
    { dir: otherSkills, origin: "global" },
  ]);
  assert.deepEqual(skills.map((skill) => skill.name), ["deploy", "review"]);
  assert.equal(skills[0].origin, "project");
  assert.match(skills[0].description, /production/);
  assert.match(skills[1].description, /Check types/);
});

test("skills without frontmatter fall back to first non-heading body line", () => {
  const [review] = listSkillsFrom([{ dir: projectSkills, origin: "project" }]).filter((skill) => skill.name === "review");
  assert.equal(review.description, "Check types, tests and error handling before approving.");
});

test("agent-style <name>/SKILL.md folders are discovered too", async () => {
  const agentDir = join(root, "agent-skills");
  mkdirSync(join(agentDir, "browser-automation"), { recursive: true });
  writeFileSync(
    join(agentDir, "browser-automation", "SKILL.md"),
    "---\ndescription: Drive a browser from the terminal\n---\nUse the browser CLI…\n",
  );
  mkdirSync(join(agentDir, "empty-dir"), { recursive: true });

  const skills = listSkillsFrom([{ dir: agentDir, origin: "~/.agents" }]);
  assert.deepEqual(skills.map((skill) => skill.name), ["browser-automation"]);
  assert.equal(skills[0].origin, "~/.agents");
  assert.equal(skills[0].description, "Drive a browser from the terminal");
  assert.match(readSkillFile(skills[0].path), /browser CLI/);
});

test("list_skills tool describes every skill", async () => {
  const output = await executeTool({ name: "list_skills", args: "{}" }, ctx);
  assert.match(output, /^deploy: Ship the app to production$/m);
  assert.match(output, /^review: Check types/m);
});

test("load_skill returns the full playbook and rejects unknown names", async () => {
  const loaded = await executeTool({ name: "load_skill", args: JSON.stringify({ name: "deploy" }) }, ctx);
  assert.match(loaded, /npm run deploy/);
  assert.doesNotMatch(loaded, /WRONG copy/);

  const unknown = await executeTool({ name: "load_skill", args: JSON.stringify({ name: "nope" }) }, ctx);
  assert.match(unknown, /Unknown skill "nope"/);
  const missing = await executeTool({ name: "load_skill", args: "{}" }, ctx);
  assert.match(missing, /Missing required argument: name/);
});

test("system prompt advertises skills when any exist", () => {
  const prompt = systemPrompt(root);
  assert.match(prompt, /Skill playbooks are available: deploy \(Ship the app to production\); review/);
  assert.match(toolSchemas().map((schema) => schema.function.name).join(","), /load_skill/);
});
