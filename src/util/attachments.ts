import { readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { expandHome } from "./paths.js";

const MAX_FILE_CHARS = 60_000;

const ATTACHMENT_TOKEN = /(?:^|\s)@([^\s@][^\s]*)/g;

/** @path tokens in the text that resolve to existing files. */
export function extractAttachments(content: string, cwd: string): string[] {
  const found: string[] = [];
  for (const match of content.matchAll(ATTACHMENT_TOKEN)) {
    const token = match[1].replace(/[.,;:!?)\]]+$/, "");
    const full = resolve(cwd, expandHome(token));
    try {
      if (statSync(full).isFile() && !found.includes(token)) found.push(token);
    } catch {
      // not a file — leave the token alone (e.g. an @mention)
    }
  }
  return found;
}

/**
 * Expand a message's attachment paths into fenced code blocks appended to the
 * content for the API payload. The stored/displayed message keeps the
 * original short text.
 */
export function expandAttachments(content: string, attachments: string[] | undefined, cwd: string): string {
  if (!attachments?.length) return content;
  const blocks = attachments.map((token) => {
    const full = resolve(cwd, expandHome(token));
    let body: string;
    try {
      if (!statSync(full).isFile()) throw new Error("not a file");
      body = readFileSync(full, "utf8");
      if (body.includes("\0")) throw new Error("binary file");
      if (body.length > MAX_FILE_CHARS) body = `${body.slice(0, MAX_FILE_CHARS)}\n… truncated (${body.length} chars total)`;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      return `@${token} (could not attach: ${reason})`;
    }
    const lang = extname(full).replace(".", "");
    return `@${token}:\n\`\`\`${lang}\n${body.endsWith("\n") ? body.slice(0, -1) : body}\n\`\`\``;
  });
  return `${content}\n\n${blocks.join("\n\n")}`;
}
