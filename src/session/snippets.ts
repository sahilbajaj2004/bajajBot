/** Merge a snippet's text into the current input with a single-space seam. */
export function insertSnippet(current: string, text: string): string {
  if (!text) return current;
  if (!current) return text;
  const end = current[current.length - 1];
  if (end === " " || end === "\n" || end === "\t") return current + text;
  return current + " " + text;
}

/** Normalize a snippet name to a stable, whitespace-free key. */
export function normalizeSnippetName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Expand literal `\n` escapes in snippet text to newlines. */
export function expandSnippetText(text: string): string {
  return text.replace(/\\n/g, "\n");
}