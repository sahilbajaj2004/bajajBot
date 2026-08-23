import { PassThrough } from "node:stream";

export interface MouseStdin {
  stream: PassThrough;
  cleanup: () => void;
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
export function createMouseStdin(real: NodeJS.ReadStream & { isTTY?: boolean }): MouseStdin {
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

  const feed = (chunk: Buffer | string): void => {
    buffer = Buffer.concat([buffer, typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk]);
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
        const button = parseInt(body.split(";")[0] ?? "", 10);
        if (buffer[end] === 0x4d && (button === 64 || button === 65)) {
          stream.write(button === 64 ? "\x1b[5~" : "\x1b[6~");
        }
        buffer = buffer.subarray(end + 1);
        continue;
      }

      // Legacy X10 mouse: ESC [ M b x y
      if (buffer.length >= 3 && buffer[1] === 0x5b && buffer[2] === 0x4d) {
        if (buffer.length < 6) return;
        const code = buffer[3];
        if (code === 96) stream.write("\x1b[5~");
        if (code === 97) stream.write("\x1b[6~");
        buffer = buffer.subarray(6);
        continue;
      }

      // Any other escape sequence: forward it once fully received (CSI ends in 0x40–0x7e)
      let i = 2;
      while (i < buffer.length && (buffer[i] < 0x40 || buffer[i] > 0x7e)) i += 1;
      if (i >= buffer.length) return;
      stream.write(buffer.subarray(0, i + 1));
      buffer = buffer.subarray(i + 1);
    }
  };

  real.on("data", feed);

  return {
    stream,
    cleanup: () => {
      real.off("data", feed);
      buffer = Buffer.alloc(0);
    },
  };
}
