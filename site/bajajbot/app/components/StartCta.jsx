"use client";

import { useState } from "react";
import Reveal from "./Reveal";
import CopyButton from "./CopyButton";

const TABS = [
  {
    id: "quickstart",
    label: "quick start",
    lines: [
      [{ t: "$ ", c: "text-ember" }, { t: "npx bajajbot" }],
      [{ t: "" }],
      [
        { t: "? provider   ▸ ", c: "text-faint" },
        { t: "openrouter", c: "text-text" },
      ],
      [
        { t: "? api key    ▸ ", c: "text-faint" },
        { t: "sk-••••••••••••••••", c: "text-text" },
      ],
      [
        { t: "? base url   ▸ ", c: "text-faint" },
        { t: "https://openrouter.ai/api/v1", c: "text-text" },
      ],
      [
        { t: "? model      ▸ ", c: "text-faint" },
        { t: "openai/gpt-oss-20b:free", c: "text-text" },
      ],
      [{ t: "" }],
      [
        { t: "✓ endpoint verified · ready to chat", c: "text-green" },
      ],
    ],
  },
  {
    id: "oneshot",
    label: "one-shot",
    lines: [
      [
        { t: "$ ", c: "text-ember" },
        { t: 'bajajbot -p "explain the login bug"' },
      ],
      [{ t: "" }],
      [
        { t: "$ ", c: "text-ember" },
        { t: 'cat src/*.md | bajajbot -p "summarize"' },
      ],
      [{ t: "" }],
      [
        { t: "$ ", c: "text-ember" },
        { t: 'bajajbot -p "add dark mode"' },
      ],
    ],
  },
  {
    id: "resume",
    label: "resume",
    lines: [
      [
        { t: "$ ", c: "text-ember" },
        { t: "bajajbot -c" },
      ],
      [{ t: "# opens your newest session", c: "text-faint" }],
      [{ t: "" }],
      [
        { t: "$ ", c: "text-ember" },
        { t: 'bajajbot -c "run the tests now"' },
      ],
      [{ t: "# resumes and follows up", c: "text-faint" }],
      [{ t: "" }],
      [
        { t: "$ ", c: "text-ember" },
        { t: "bajajbot sessions" },
      ],
      [{ t: "# pick from a terminal picker", c: "text-faint" }],
    ],
  },
];

export default function StartCta() {
  const [active, setActive] = useState(TABS[0].id);
  const tab = TABS.find((t) => t.id === active);
  const raw = tab.lines
    .map((line) => line.map((s) => s.t).join(""))
    .join("\n");

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <Reveal>
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-mute"># start building</p>
        </div>
        <h2 className="mt-5 max-w-[22ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          Start building with BajajBot today.
        </h2>
        <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-mute md:text-base">
          Free, bring your own key. One command and the setup wizard has you
          chatting against a real endpoint in under a minute.
        </p>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-10">
          <div
            role="tablist"
            aria-label="Usage examples"
            className="inline-flex flex-wrap gap-1 rounded-md border border-line bg-panel p-1"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={active === t.id}
                onClick={() => setActive(t.id)}
                className={`rounded px-4 py-2 text-[13px] transition-colors ${
                  active === t.id
                    ? "bg-ember font-semibold text-black"
                    : "text-mute hover:text-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line bg-panel2 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#3b3b3e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3b3b3e]" />
                <span className="ml-2 text-xs text-faint">
                  you@machine · {tab.label}
                </span>
              </div>
              <CopyButton text={raw} />
            </div>
            <div className="overflow-x-auto px-4 py-4 text-[13px] leading-relaxed">
              {tab.lines.map((line, i) => (
                <p key={i} className="min-h-[1.45em] whitespace-pre">
                  {line.map((s, j) => (
                    <span key={j} className={s.c ?? "text-text"}>
                      {s.t}
                    </span>
                  ))}
                </p>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}