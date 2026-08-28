"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { useReducedMotion } from "motion/react";

const SCRIPT = [
  { segs: [{ t: "$ npx bajajbot" }], mode: "type", delay: 350 },
  { segs: [{ t: "" }], mode: "instant", delay: 90 },
  {
    segs: [{ t: "bajajbot v1.2.0 · gpt-oss-20b:free", c: "text-mute" }],
    mode: "instant",
    delay: 240,
  },
  {
    segs: [{ t: "❯ add dark mode to this app" }],
    mode: "type",
    delay: 460,
  },
  { segs: [{ t: "" }], mode: "instant", delay: 60 },
  {
    segs: [{ t: "set_plan · 3 steps", c: "text-mute" }],
    mode: "instant",
    delay: 340,
  },
  {
    segs: [{ t: "  ✓ inspect current theming", c: "text-mute" }],
    mode: "instant",
    delay: 40,
  },
  {
    segs: [{ t: "  ▸ add theme toggle state", c: "text-ember" }],
    mode: "instant",
    delay: 140,
  },
  {
    segs: [{ t: "  ○ wire the styles", c: "text-faint" }],
    mode: "instant",
    delay: 40,
  },
  { segs: [{ t: "" }], mode: "instant", delay: 50 },
  {
    segs: [{ t: "fetch @src/ui/theme.ts", c: "text-mute" }, { t: " (ok)", c: "text-faint" }],
    mode: "instant",
    delay: 300,
  },
  {
    segs: [{ t: "fetch @src/ui/App.tsx", c: "text-mute" }, { t: " (ok)", c: "text-faint" }],
    mode: "instant",
    delay: 80,
  },
  {
    segs: [
      { t: "edit @src/ui/App.tsx", c: "text-mute" },
      { t: " · ", c: "text-faint" },
      { t: "+11", c: "text-green" },
      { t: " ", c: "text-faint" },
      { t: "−2", c: "text-red" },
    ],
    mode: "instant",
    delay: 300,
  },
  {
    segs: [{ t: "approve? [y/n]", c: "text-faint" }],
    mode: "instant",
    delay: 320,
  },
  { segs: [{ t: "y", c: "text-ember" }], mode: "type", delay: 320 },
  {
    segs: [
      { t: "✓ checkpoint saved", c: "text-green" },
      { t: " (hidden git ref)", c: "text-faint" },
    ],
    mode: "instant",
    delay: 300,
  },
  {
    segs: [{ t: "done · 3 files changed" }],
    mode: "type",
    delay: 260,
  },
];

const RESTART_DELAY = 2200;

export default function TerminalDemo() {
  const reduce = useReducedMotion();
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (reduce) {
      setLine(SCRIPT.length);
      setChars(0);
      return;
    }
    let i = 0;
    let ci = 0;
    let cancelled = false;
    const timers = [];

    const tick = () => {
      if (cancelled) return;

      if (i >= SCRIPT.length) {
        timers.push(
          setTimeout(() => {
            i = 0;
            ci = 0;
            setLine(0);
            setChars(0);
            tick();
          }, RESTART_DELAY)
        );
        return;
      }

      const entry = SCRIPT[i];
      const total = entry.segs.map((s) => s.t).join("").length;

      if (entry.mode === "instant" || ci === total) {
        i += 1;
        ci = 0;
        setLine(i);
        setChars(0);
        const nxt = SCRIPT[i];
        timers.push(setTimeout(tick, nxt ? nxt.delay : 0));
        return;
      }

      ci += 1;
      setChars(ci);
      timers.push(setTimeout(tick, 13));
    };

    timers.push(setTimeout(tick, SCRIPT[0].delay));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [run, reduce]);

  const done = line >= SCRIPT.length;
  const active = !done ? SCRIPT[line] : SCRIPT[SCRIPT.length - 1];
  const partial =
    !done && active.mode === "type"
      ? active.segs.map((s) => s.t).join("").slice(0, chars)
      : null;

  function jump(lineIdx) {
    return (
      <p
        key={lineIdx}
        className="min-h-[1.45em] whitespace-pre-wrap leading-relaxed"
      >
        {lineIdx < line
          ? SCRIPT[lineIdx].segs.map((s, j) => (
              <span key={j} className={s.c ?? "text-text"}>
                {s.t}
              </span>
            ))
          : null}
      </p>
    );
  }

  return (
    <div className="terminal-glow overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-panel2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3b3b3e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3b3b3e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3b3b3e]" />
          <span className="ml-3 hidden text-xs text-faint sm:inline">
            you@machine · bash
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setLine(0);
            setChars(0);
            setRun((r) => r + 1);
          }}
          aria-label="Replay the demo"
          className="flex items-center gap-1.5 text-xs text-faint transition-colors hover:text-ember"
        >
          replay
          <ArrowClockwise size={12} weight="bold" />
        </button>
      </div>

      <div
        id="term-screen"
        className="relative h-[400px] overflow-hidden px-4 py-4 text-left text-[13px]"
      >
        <div className="pointer-events-none absolute inset-0 scanlines" />
        {SCRIPT.slice(0, line).map((_, idx) => jump(idx))}
        {!done && partial !== null && (
          <p className="whitespace-pre-wrap leading-relaxed">
            <span className="text-text">{partial}</span>
            <span className="cursor-blink ml-0.5 inline-block h-[1em] w-[7px] translate-y-[2px] bg-ember" />
          </p>
        )}
        {done && (
          <p className="whitespace-pre-wrap leading-relaxed">
            <span
              className="cursor-blink ml-0.5 inline-block h-[1em] w-[7px] translate-y-[2px] bg-ember"
              aria-label="terminal prompt"
            />
          </p>
        )}
      </div>
    </div>
  );
}