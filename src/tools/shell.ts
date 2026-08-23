import { execFile } from "node:child_process";
import type { ToolArgs, ToolDef } from "./types.js";

const MAX_OUTPUT = 10_000;

export const runCommand: ToolDef = {
  name: "run_command",
  description: "Run a shell command (bash) in the project directory and return combined stdout/stderr.",
  risky: true,
  parameters: {
    type: "object",
    properties: { command: { type: "string", description: "The bash command to run" } },
    required: ["command"],
  },
  summary: (args) => `$ ${args.command ?? ""}`.slice(0, 80),
  execute: (args, ctx) =>
    new Promise((resolvePromise) => {
      const command = args.command;
      if (typeof command !== "string" || !command.trim()) {
        resolvePromise("Error: missing required argument: command");
        return;
      }
      execFile(
        "bash",
        ["-c", command],
        { cwd: ctx.cwd, timeout: 30_000, maxBuffer: 1_048_576 },
        (error, stdout, stderr) => {
          let output = `${stdout}${stderr ? `${stdout ? "\n" : ""}${stderr}` : ""}`.trim();
          if (output.length > MAX_OUTPUT) output = `${output.slice(0, MAX_OUTPUT)}\n… truncated`;
          if (error && typeof error.code === "number" && error.code !== 0) {
            resolvePromise(`${output || "(no output)"}\n(exit code ${error.code})`);
            return;
          }
          resolvePromise(output || "(no output)");
        },
      );
    }),
};
