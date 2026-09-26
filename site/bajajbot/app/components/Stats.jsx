"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import Reveal from "./Reveal";

const STATS = [
  {
    key: "context_budget",
    value: 12000,
    suffix: " tok",
    label: "tokens before auto-compaction summarizes older turns",
  },
  {
    key: "max_retries",
    value: 3,
    label: "automatic backoff when a provider rate-limits you",
  },
  {
    key: "checkpoint_window",
    value: 300,
    label: "git snapshots kept per project, newest wins",
  },
  {
    key: "colorways",
    value: 6,
    label: "switch live with /theme, persisted to your config",
  },
];

function Count({ value, suffix }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);

  useEffect(() => {
    const el = ref.current;
    if (reduce) {
      setN(value);
      return;
    }
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        animate(0, value, {
          duration: 1.2,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) => setN(Math.round(v)),
        });
      },
      { rootMargin: "0px 0px -20% 0px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [value, reduce]);

  return (
    <span ref={ref}>
      {n.toLocaleString("en-US")}
      {suffix ?? ""}
    </span>
  );
}

export default function Stats() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-10 md:py-14">
      <Reveal>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.key} className="bg-panel p-6">
              <p className="text-xs text-faint">
                <span aria-hidden="true" className="text-mute">
                  {s.key}
                </span>
              </p>
              <p className="mt-3 text-3xl font-semibold text-ember">
                <Count value={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-mute">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}