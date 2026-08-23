#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { startChat } from "../src/commands/chat.js";
import { loadSession } from "../src/session/history.js";
import { registerSessionsCommand } from "../src/commands/sessionsCmd.js";
import { registerConfigCommands } from "../src/commands/configCmd.js";

function packageVersion(): string {
  let dir = dirname(process.argv[1] ?? ".");
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
      if (pkg.name === "bajajbot") return pkg.version ?? "unknown";
    } catch {
      dir = dirname(dir);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "unknown";
}

const program = new Command();
program.name("bajajbot").description("Terminal AI chat client").version(packageVersion());
registerConfigCommands(program);
program.command("chat").description("Start a chat").option("--resume <id>").action(({ resume }: { resume?: string }) => startChat(resume ? loadSession(resume) : undefined));
registerSessionsCommand(program);
program.action(() => startChat());

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
