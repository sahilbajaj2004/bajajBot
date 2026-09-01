import type { CommandDef } from "./commands.js";

/** Case-insensitive substring across name + description. */
export function paletteMatch(query: string, command: CommandDef): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return command.name.includes(needle) || command.description.toLowerCase().includes(needle);
}