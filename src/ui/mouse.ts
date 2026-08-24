import { PassThrough } from "node:stream";

export type MouseInput =
  | { type: "press"; button: number; x: number; y: number }
  | { type: "drag"; button: number; x: number; y: number }
  | { type: "release"; button: number; x: number; y: number }
  | { type: "wheel"; direction: "up" | "down"; x: number; y: number };

export interface MouseStdin {
  stream: PassThrough;
  cleanup: () => void;
  on: (listener: (event: MouseInput) => void) => () => void;
}

/**
 * Wraps the real stdin so that:
 * - normal keystrokes pass through to ink untouched
 * - mouse wheel sequences are consumed here and re-emitted as
 *   PageUp/PageDown escapes, which ink already understands
 *
 * Ink calls setEncoding/ref/unref/setRawMode on whatever stream it is
 * given, so all of those are forwarded to the real TTY.
 */
export function createMouseStdin(
  real: NodeJS.ReadStream & { isTTY?: boolean },
): MouseStdin {
  const listeners = new Set<(event: MouseInput) => void>();
  const emit = (event: MouseInput): void => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // a broken listener must not kill input handling
      }
    }
  };

  const stream = new PassThrough() as PassThrough & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode: (mode: boolean) => unknown;
    ref: () => unknown;
    unref: () => unknown;
  };
  stream.isTTY = true;
  stream.isRaw = false;
  stream.setRawMode = (mode: boolean) => {
    try {
      real.setRawMode?.(mode);
      stream.isRaw = mode;
    } catch {
      // non-tty environments ignore raw mode changes
    }
    return stream;
  };
  stream.ref = () => {
    try {
      real.ref?.();
    } catch {
      // not a ref-holding stream
    }
    return stream;
  };
  stream.unref = () => {
    try {
      real.unref?.();
    } catch {
      // not a ref-holding stream
    }
    return stream;
  };

  let buffer = Buffer.alloc(0);
  let escTimer: ReturnType<typeof setTimeout> | undefined;

  // A lone ESC with nothing following it is the Escape key, not a sequence —
  // flush it after a short wait so Esc presses reach ink immediately.
  const flushLoneEsc = (): void => {
    escTimer = undefined;
    if (buffer.length === 1 && buffer[0] === 0x1b) {
      stream.write(buffer);
      buffer = Buffer.alloc(0);
    }
  };

  const feed = (chunk: Buffer | string): void => {
    buffer = Buffer.concat([buffer, typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk]);
    if (escTimer !== undefined && buffer.length > 1) {
      clearTimeout(escTimer);
      escTimer = undefined;
    }
    while (buffer.length > 0) {
      const esc = buffer.indexOf(0x1b);
      if (esc === -1) {
        stream.write(buffer);
        buffer = Buffer.alloc(0);
        return;
      }
      if (esc > 0) {
        stream.write(buffer.subarray(0, esc));
        buffer = buffer.subarray(esc);
      }

      // SGR mouse: ESC [ < b ; x ; y M|m
      if (buffer.length >= 3 && buffer[1] === 0x5b && buffer[2] === 0x3c) {
        const pressEnd = buffer.indexOf(0x4d);
        const releaseEnd = buffer.indexOf(0x6d);
        const ends = [pressEnd, releaseEnd].filter((index) => index >= 0 && index < 64);
        if (ends.length === 0) {
          if (buffer.length >= 64) buffer = buffer.subarray(3); // runaway garbage, drop prefix
          return;
        }
        const end = Math.min(...ends);
        const body = buffer.subarray(3, end).toString("ascii");
        buffer = buffer.subarray(end + 1);
        const fields = body.split(";");
        const code = parseInt(fields[0] ?? "", 10);
        const x = parseInt(fields[1] ?? "", 10);
        const y = parseInt(fields[2] ?? "", 10);
        if (!Number.isFinite(code) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        const released = end === releaseEnd;
        const button = code & 3;
        if (code >= 64 && code <= 67 && !released) {
          if (code === 64 || code === 65) {
            stream.write(code === 64 ? "\x1b[5~" : "\x1b[6~");
            emit({ type: "wheel", direction: code === 64 ? "up" : "down", x, y });
          }
        } else if (released) {
          emit({ type: "release", button, x, y });
        } else if (code >= 32 && code < 64) {
          emit({ type: "drag", button, x, y });
        } else {
          emit({ type: "press", button, x, y });
        }
        continue;
      }

      // Legacy X10 mouse: ESC [ M b x y
      if (buffer.length >= 3 && buffer[1] === 0x5b && buffer[2] === 0x4d) {
        if (buffer.length < 6) return;
        const code = buffer[3];
        if (code === 96) stream.write("\x1b[5~");
        if (code === 97) stream.write("\x1b[6~");
        const button = code & 3;
        const x = buffer[4] - 32;
        const y = buffer[5] - 32;
        if (code >= 96) emit({ type: "wheel", direction: code === 96 ? "up" : "down", x, y });
        else if (button < 3 && x > 0 && y > 0) emit({ type: "press", button, x, y });
        buffer = buffer.subarray(6);
        continue;
      }

      // Any other escape sequence: forward it once fully received (CSI ends in 0x40–0x7e)
      let i = 2;
      while (i < buffer.length && (buffer[i] < 0x40 || buffer[i] > 0x7e)) i += 1;
      if (i >= buffer.length) {
        if (buffer.every((byte) => byte === 0x1b)) {
          if (buffer.length > 1) {
            stream.write(buffer.subarray(0, buffer.length - 1));
            buffer = buffer.subarray(buffer.length - 1);
          }
          if (escTimer === undefined) escTimer = setTimeout(flushLoneEsc, 30);
        }
        return;
      }
      stream.write(buffer.subarray(0, i + 1));
      buffer = buffer.subarray(i + 1);
    }
  };

  real.on("data", feed);

  return {
    stream,
    cleanup: () => {
      real.off("data", feed);
      listeners.clear();
      if (escTimer !== undefined) clearTimeout(escTimer);
      buffer = Buffer.alloc(0);
    },
    on: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
