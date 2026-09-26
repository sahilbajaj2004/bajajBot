/** Strip ANSI escape sequences (SGR colors, OSC titles, charset switches) from text. */
export function stripAnsi(text: string): string {
  return text.replace(
    /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]/g,
    "",
  );
}

/** Inclusive cell rectangle in screen coordinates (0-based). */
export interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export function normalizeRect(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    top: Math.min(ay, by),
    bottom: Math.max(ay, by),
    left: Math.min(ax, bx),
    right: Math.max(ax, bx),
  };
}

/**
 * Extract the text covered by `rect` from an array of per-row plain strings.
 * Rows are relative to the array (not the screen). Out-of-range rows are skipped.
 */
export function extractSelectedText(lines: string[], rect: Rect): string {
  if (lines.length === 0) return "";
  const parts: string[] = [];
  for (let row = rect.top; row <= rect.bottom; row += 1) {
    const raw = lines[row];
    if (raw === undefined) continue;
    const plain = stripAnsi(raw).trimEnd();
    const from = row === rect.top ? Math.max(0, Math.min(rect.left, plain.length)) : 0;
    const to = row === rect.bottom ? Math.max(0, Math.min(rect.right + 1, plain.length)) : plain.length;
    parts.push(plain.slice(from, Math.max(from, to)));
  }
  return parts.join("\n");
}

export interface Segment {
  text: string;
  hl: boolean;
}

/**
 * Split a plain line into highlight segments for columns [left..right], padded
 * with spaces out to `width` so a selection block looks continuous.
 */
export function segmentLine(text: string, left: number, right: number, width: number): Segment[] {
  const plain = stripAnsi(text);
  const padded = plain.padEnd(width);
  const end = Math.min(right + 1, padded.length);
  const start = Math.max(0, Math.min(left, end));
  const segments: Segment[] = [];
  if (start > 0) segments.push({ text: padded.slice(0, start), hl: false });
  if (end > start) segments.push({ text: padded.slice(start, end), hl: true });
  if (padded.length > end) segments.push({ text: padded.slice(end), hl: false });
  return segments.length > 0 ? segments : [{ text: "", hl: false }];
}
