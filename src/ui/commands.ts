export interface CommandDef {
  name: string;
  description: string;
}

export const COMMANDS: CommandDef[] = [
  { name: "/help", description: "Show available commands" },
  { name: "/btw", description: "Side question — answered instantly, not added to the chat" },
  { name: "/compare", description: "Ask two models side by side — pick the better answer" },
  { name: "/model", description: "Switch model (no arg opens picker)" },
  { name: "/copy", description: "Copy last assistant reply to clipboard" },
  { name: "/retry", description: "Regenerate the last assistant reply" },
  { name: "/undo", description: "Remove the last exchange" },
  { name: "/export", description: "Save chat to a file (arg: json)" },
  { name: "/search", description: "Find text in this chat (jump to match)" },
  { name: "/skills", description: "Browse skills · enter runs one now" },
  { name: "/checkpoints", description: "Browse git snapshots · restore files" },
  { name: "/changes", description: "Files the agent created/edited/deleted this session" },
  { name: "/theme", description: "Switch the UI colorway" },
  { name: "/memory", description: "What the agent remembers across sessions" },
  { name: "/sessions", description: "Resume a saved chat" },
  { name: "/usage", description: "Token and cost totals across all chats" },
  { name: "/profile", description: "Switch saved provider profile" },
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
