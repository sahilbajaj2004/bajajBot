#!/usr/bin/env node
import { Command } from "commander";
import { startChat } from "../src/commands/chat.js";
import { runPrintTurn } from "../src/commands/printCmd.js";
import { configExists, loadConfig } from "../src/config/store.js";
import { loadSession, listSessions } from "../src/session/history.js";
import { registerSessionsCommand } from "../src/commands/sessionsCmd.js";
import { registerConfigCommands } from "../src/commands/configCmd.js";
import { registerUsageCommand } from "../src/commands/usageCmd.js";
import { packageVersion } from "../src/util/pkgVersion.js";

process.title = "bajajbot";

async function readPipedStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: string[] = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  return chunks.join("");
}

const program = new Command();
program.name("bajajbot").description("Terminal AI chat client").version(packageVersion());
registerConfigCommands(program);
program.command("chat").description("Start a chat").option("--resume <id>").action(({ resume }: { resume?: string }) => startChat(resume ? loadSession(resume) : undefined));
registerSessionsCommand(program);
registerUsageCommand(program);

program
  .argument("[prompt...]", "prompt for --print mode or first chat message")
  .option("-p, --print", "one-shot: run the prompt with agent tools, print the answer, exit")
  .option("-c, --continue", "resume your most recent session")
  .action(async (promptParts: string[], options: { print?: boolean; continue?: boolean }) => {
    const prompt = promptParts.map((part: string) => part.trim()).filter(Boolean).join(" ").trim();
    if (!options.print && !options.continue) return startChat(undefined, prompt || undefined, packageVersion());
    if (options.continue && !options.print) {
      const [latest] = listSessions();
      if (!latest) {
        console.error("bajajbot: no saved sessions yet - starting a new chat.");
        return startChat(undefined, prompt || undefined);
      }
      return startChat(loadSession(latest.id), prompt || undefined, packageVersion());
    }
    const piped = await readPipedStdin();
    const full = piped && prompt ? `${prompt}\n\n${piped}` : prompt || piped;
    if (!full) {
      console.error("bajajbot: --print needs a prompt (as arguments or piped stdin).");
      process.exitCode = 1;
      return;
    }
    if (!configExists()) {
      console.error("bajajbot: no config found. Run `bajajbot config init` first.");
      process.exitCode = 1;
      return;
    }
    try {
      const { reply, denied } = await runPrintTurn(loadConfig(), full, { onToken: (token) => process.stdout.write(token) });
      process.stdout.write("\n");
      for (const action of denied) console.error(`· skipped (needs confirmation): ${action}`);
      if (!reply.trim()) process.exitCode = 1;
    } catch (cause) {
      console.error(`✗ ${cause instanceof Error ? cause.message : String(cause)}`);
      process.exitCode = 1;
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
