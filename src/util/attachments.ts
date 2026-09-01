import { readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { expandHome } from "./paths.js";
import type { ContentPart, Message } from "../session/types.js";

const MAX_FILE_CHARS = 60_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const ATTACHMENT_TOKEN = /(?:^|\s)@([^\s@][^\s]*)/g;

function isImageFile(token: string): boolean {
  return Boolean(IMAGE_MIME[extname(token.toLowerCase())]);
}

/** @path tokens in the text split into text files and images. */
export function extractAttachments(content: string, cwd: string): { texts: string[]; images: string[] } {
  const texts: string[] = [];
  const images: string[] = [];
  for (const match of content.matchAll(ATTACHMENT_TOKEN)) {
    const token = match[1].replace(/[.,;:!?)\]]+$/, "");
    const full = resolve(cwd, expandHome(token));
    try {
      if (!statSync(full).isFile()) continue;
      if (!texts.includes(token) && !images.includes(token)) {
        if (isImageFile(token)) images.push(token);
        else texts.push(token);
      }
    } catch {
      // not a file — leave the token alone (e.g. an @mention)
    }
  }
  return { texts, images };
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

/**
 * Build the API payload content for a user message that may carry text
 * attachments and/or images. Returns a plain string when there is nothing
 * multimodal to do.
 */
export function buildVisionContent(message: Message, cwd: string): string | ContentPart[] {
  const hasImages = Boolean(message.images?.length);
  if (!hasImages) return expandAttachments(message.content, message.attachments, cwd);

  const notes: string[] = [];
  const parts: ContentPart[] = [
    { type: "text", text: expandAttachments(message.content, message.attachments, cwd) },
  ];
  for (const token of message.images ?? []) {
    try {
      const full = resolve(cwd, expandHome(token));
      const buffer = readFileSync(full);
      if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("larger than 4 MB");
      const mime = IMAGE_MIME[extname(full).toLowerCase()] ?? "application/octet-stream";
      parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${buffer.toString("base64")}` } });
    } catch (cause) {
      notes.push(`@${token} (could not attach image: ${cause instanceof Error ? cause.message : String(cause)})`);
    }
  }
  if (notes.length) parts[0].text += `\n\n${notes.join("\n")}`;
  return parts;
}
