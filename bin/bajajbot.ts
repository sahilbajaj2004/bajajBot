#!/usr/bin/env node
import { Command } from "commander";
import { startChat } from "../src/commands/chat.js";
import { loadSession } from "../src/session/history.js";
import { registerSessionsCommand } from "../src/commands/sessionsCmd.js";
import { registerConfigCommands } from "../src/commands/configCmd.js";

const program = new Command();
program.name("bajajbot").description("Terminal AI chat client").version("0.1.0");
registerConfigCommands(program);
program.command("chat").description("Start a chat").option("--resume <id>").action(({ resume }: { resume?: string }) => startChat(resume ? loadSession(resume) : undefined));
registerSessionsCommand(program);
program.action(() => startChat());

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
