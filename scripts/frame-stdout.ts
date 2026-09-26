import { Readable, Writable } from "node:stream";

/** Minimal TTY-ish stdout that keeps every frame Ink writes. */
export class FrameStdout extends Writable {
  columns: number;
  rows: number;
  isTTY = true;
  frames: string[] = [];

  constructor(columns = 100, rows = 30) {
    super();
    this.columns = columns;
    this.rows = rows;
  }

  /** Claim truecolor so chalk emits the escapes the real terminal would. */
  getColorDepth(): number {
    return 24;
  }

  hasColors(): boolean {
    return true;
  }

  override _write(chunk: unknown, _encoding: BufferEncoding, callback: () => void): void {
    this.frames.push(String(chunk));
    callback();
  }

  /** Drop captured frames so the next read reflects only new writes. */
  reset(): void {
    this.frames = [];
  }

  /** Strip ANSI escapes so assertions read against plain text. */
  get plain(): string {
    return this.latest.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
  }

  /**
   * Newest frame with real content. Ink's trailing writes are cursor
   * housekeeping, so the last frame is not always the last picture.
   */
  get latest(): string {
    const solid = this.frames.filter((frame) => frame.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").trim().length > 8);
    return solid.at(-1) ?? this.frames.at(-1) ?? "";
  }

  get lines(): string[] {
    return this.plain.split("\n");
  }
}

/** Minimal TTY-ish stdin so Ink enables raw mode in a headless run. */
export class FrameStdin extends Readable {
  isTTY = true;
  setRawMode(): this {
    return this;
  }
  ref(): this {
    return this;
  }
  unref(): this {
    return this;
  }
  override _read(): void {}
}
