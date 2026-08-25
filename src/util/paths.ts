import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Expand a leading ~ to the user's home directory (~/x on all platforms,
 * ~\x included for Windows). ~user syntax is left untouched.
 */
export function expandHome(target: string): string {
  if (!target.startsWith("~")) return target;
  const rest = target.slice(1);
  if (rest === "" || rest === "/" || rest === "\\") return homedir();
  if (rest.startsWith("/") || rest.startsWith("\\")) return join(homedir(), rest.slice(1));
  return target;
}
