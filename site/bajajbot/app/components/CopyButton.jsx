"use client";

import { useState } from "react";
import { Copy, Check } from "@phosphor-icons/react";

export default function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Copy ${text}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="flex items-center gap-1.5 text-xs text-faint transition-colors hover:text-ember"
    >
      {copied ? (
        <>
          <Check size={13} weight="bold" className="text-green" />
          copied
        </>
      ) : (
        <>
          <Copy size={13} weight="bold" />
          copy
        </>
      )}
    </button>
  );
}