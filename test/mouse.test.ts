import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createMouseStdin, type MouseInput } from "../src/ui/mouse.js";

/** Drive the parser with a fake TTY and collect what it emits. */
function feed(sequences: string[]): MouseInput[] {
  const real = new PassThrough() as PassThrough & {
    isTTY?: boolean;
    setRawMode?: (mode: boolean) => unknown;
    ref?: () => unknown;
    unref?: () => unknown;
  };
  real.isTTY = true;
  const seen: MouseInput[] = [];
  const mouse = createMouseStdin(real as never);
  mouse.on((event) => seen.push(event));
  for (const sequence of sequences) real.write(sequence);
  mouse.cleanup();
  return seen;
}

test("SGR press, drag and release are reported with 1-based cells", () => {
  const events = feed(["\u001b[<0;10;5M", "\u001b[<32;11;5M", "\u001b[<0;11;5m"]);
  assert.deepEqual(events, [
    { type: "press", button: 0, x: 10, y: 5 },
    { type: "drag", button: 0, x: 11, y: 5 },
    { type: "release", button: 0, x: 11, y: 5 },
  ]);
});

test("SGR motion with no button held becomes a hover event", () => {
  // 35 = motion (32) with the "no button" slot (3).
  const events = feed(["\u001b[<35;7;1M"]);
  assert.deepEqual(events, [{ type: "motion", x: 7, y: 1 }]);
});

test("motion while a button is held stays a drag", () => {
  const events = feed(["\u001b[<32;7;1M", "\u001b[<34;9;1M"]);
  assert.deepEqual(events, [
    { type: "drag", button: 0, x: 7, y: 1 },
    { type: "drag", button: 2, x: 9, y: 1 },
  ]);
});

test("legacy X10 motion is reported as hover too", () => {
  // X10: ESC [ M b x y, with 35 = motion and cells offset by 32.
  const events = feed(["\u001b[M#((\u0028"]); // 35, 40, 40 -> cells 8, 8
  assert.deepEqual(events, [{ type: "motion", x: 8, y: 8 }]);
});

test("legacy X10 motion with an impossible cell is dropped", () => {
  // A cell of 0 is not a real position, so it must not be reported.
  assert.deepEqual(feed(["\u001b[M#\u0020\u0025"]), []);
});

test("wheel is translated and reported separately", () => {
  const events = feed(["\u001b[<64;1;1M", "\u001b[<65;1;1M"]);
  assert.deepEqual(events, [
    { type: "wheel", direction: "up", x: 1, y: 1 },
    { type: "wheel", direction: "down", x: 1, y: 1 },
  ]);
});

test("a partial sequence is held until the rest arrives", () => {
  const real = new PassThrough() as PassThrough & { isTTY?: boolean };
  real.isTTY = true;
  const seen: MouseInput[] = [];
  const mouse = createMouseStdin(real as never);
  mouse.on((event) => seen.push(event));
  real.write("\u001b[<35;1");
  assert.deepEqual(seen, [], "incomplete sequence emits nothing");
  real.write("2;1M");
  assert.deepEqual(seen, [{ type: "motion", x: 12, y: 1 }]);
  mouse.cleanup();
});

test("plain typing still passes through to ink untouched", () => {
  const real = new PassThrough() as PassThrough & { isTTY?: boolean };
  real.isTTY = true;
  const mouse = createMouseStdin(real as never);
  let forwarded = "";
  mouse.stream.on("data", (chunk) => {
    forwarded += String(chunk);
  });
  real.write("hello\r");
  assert.equal(forwarded, "hello\r");
  mouse.cleanup();
});
