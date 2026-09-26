"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";

const links = [
  ["Features", "#features"],
  ["Cheat sheet", "#cheat-sheet"],
  ["The way", "#way"],
];

export default function Nav() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const last = useRef(0);
  const [hidden, setHidden] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    if (reduce) return;
    const prev = last.current;
    last.current = y;
    setHidden(y > 140 && y > prev);
  });

  return (
    <motion.header
      animate={{ y: hidden ? "-150%" : 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      <nav
        aria-label="Primary"
        className="pointer-events-auto flex h-14 w-full max-w-[1160px] items-center justify-between gap-4 rounded-full border border-line bg-ink/85 px-5 shadow-[0_12px_48px_-18px_rgba(0,0,0,0.85)] backdrop-blur-md"
      >
        <a
          href="#"
          className="flex items-baseline gap-2 whitespace-nowrap text-[15px] font-semibold tracking-tight"
        >
          <span className="text-ember">❯</span>
          <span>bajajbot</span>
          <span className="hidden text-xs font-normal text-faint sm:inline">
            v1.2.0
          </span>
        </a>

        <div className="hidden items-center gap-6 text-sm text-mute md:flex">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="transition-colors hover:text-text"
            >
              {label}
            </a>
          ))}
          <a
            href="https://www.npmjs.com/package/bajajbot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-text"
          >
            <span aria-hidden="true" className="text-ember">
              ★
            </span>
            npm
          </a>
        </div>

        <a
          href="#install"
          className="whitespace-nowrap rounded-full bg-ember px-4 py-2 text-[13px] font-semibold text-black transition-all hover:brightness-110 active:scale-[0.98]"
        >
          npx bajajbot
        </a>
      </nav>
    </motion.header>
  );
}