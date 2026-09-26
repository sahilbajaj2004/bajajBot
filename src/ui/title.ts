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
  return name ? `BajajBot - ${name}` : "BajajBot";
}

/** Short session label from the first real user message (skips compaction bridges). */
export function deriveSessionTitle(firstPrompt?: string): string | undefined {
  if (!firstPrompt || firstPrompt.startsWith("[")) return undefined;
  const name = clean(firstPrompt);
  if (!name) return undefined;
  return name.length > 48 ? `${name.slice(0, 47)}…` : name;
}

/** Compact "#fc68"-style badge for a session id like "ses_fc68a88d…" or "chat-1756…". */
export function shortSessionId(id: string): string {
  const bare = id.replace(/^ses_?/i, "");
  // BajajBot ids are "chat-<epochms>[-n]"; the leading word is the same for
  // every session, so badge the distinctive tail instead.
  if (bare.startsWith("chat-")) {
    const stamp = bare.slice(5).split("-")[0] ?? "";
    return stamp.length > 4 ? stamp.slice(-4) : bare.slice(0, 4);
  }
  return bare.slice(0, 4);
}
