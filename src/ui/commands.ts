export interface CommandDef {
  name: string;
  description: string;
}

export const COMMANDS: CommandDef[] = [
  { name: "/help", description: "Show available commands" },
  { name: "/model", description: "Switch model (no arg opens picker)" },
  { name: "/sessions", description: "Resume a saved chat" },
  { name: "/new", description: "Start a new chat" },
  { name: "/logout", description: "Delete all config and sessions" },
];

export function filterCommands(input: string): CommandDef[] {
  if (!/^\/\S*$/.test(input)) return [];
  return COMMANDS.filter((command) => command.name.startsWith(input));
}

export function matchCommand(input: string): { command: CommandDef; arg: string } | null {
  const [name, ...rest] = input.trim().split(/\s+/);
  const command = COMMANDS.find((entry) => entry.name === name);
  return command ? { command, arg: rest.join(" ") } : null;
}
