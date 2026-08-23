const clean = (text: string): string =>
  text
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function setTerminalTitle(title: string): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\x1b]0;${title}\x07`);
}

export function sessionTitle(firstPrompt?: string): string {
  const name = firstPrompt ? clean(firstPrompt).slice(0, 60) : "";
  return name ? `BajajBot — ${name}` : "BajajBot";
}
