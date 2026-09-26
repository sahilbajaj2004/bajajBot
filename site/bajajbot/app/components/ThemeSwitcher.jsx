"use client";

import { useEffect, useState } from "react";
import { Palette } from "@phosphor-icons/react";

const THEMES = [
  { name: "ember", hex: "#ff8c42" },
  { name: "ocean", hex: "#38bdf8" },
  { name: "matrix", hex: "#22c55e" },
  { name: "rose", hex: "#fb7185" },
  { name: "violet", hex: "#a78bfa" },
  { name: "mono", hex: "#e5e5e5" },
];

const STORAGE_KEY = "bb-theme";

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("ember");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && THEMES.some((t) => t.name === saved)) setActive(saved);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  function apply(name) {
    setActive(name);
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      /* ignore */
    }
    const el = document.documentElement;
    if (name === "ember") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", name);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div
          role="menu"
          aria-label="Colorway"
          className="mb-3 overflow-hidden rounded-lg border border-line bg-panel shadow-xl"
        >
          <p className="border-b border-line bg-panel2 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-faint">
            /theme · switch live
          </p>
          {THEMES.map((t) => (
            <button
              key={t.name}
              type="button"
              role="menuitemradio"
              aria-checked={active === t.name}
              onClick={() => apply(t.name)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-panel2"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: t.hex }}
              />
              <span className={active === t.name ? "font-semibold text-text" : "text-mute"}>
                {t.name}
              </span>
              {active === t.name && (
                <span aria-hidden="true" className="ml-auto text-ember">
                  ▸
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch theme"
        className="flex items-center gap-2.5 rounded-full border border-line bg-panel/90 px-3.5 py-2.5 text-[13px] text-mute shadow-lg backdrop-blur transition-colors hover:text-text"
      >
        <Palette size={14} weight="bold" className="text-ember" />
        <span className="hidden sm:inline">theme</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {THEMES.map((t) => (
            <span
              key={t.name}
              className={`h-2 w-2 rounded-full ${
                active === t.name ? "ring-1 ring-white/40" : ""
              }`}
              style={{ background: t.hex }}
            />
          ))}
        </span>
      </button>
    </div>
  );
}