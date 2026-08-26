/**
 * One contextual command hint for the status bar right slot — teaches the
 * relevant escape hatch for whatever the user is doing instead of static
 * filler text.
 */

const ROTATING_TIPS = [
  "/usage totals across chats",
  "@file attaches code · @img attaches images",
  "/undo removes last · /retry regenerates",
  "/sessions resumes saved chats",
  "type / for all commands",
];

export function contextualTip(state: {
  contextPercent?: number | null;
  errored?: boolean;
}): string {
  if (state.errored) return "/retry regenerates · /model switches provider";
  if ((state.contextPercent ?? 0) >= 70) return "/export saves this chat · /new starts fresh";
  return ROTATING_TIPS[0];
}

/** Same, but cycles the default tips by a stable counter (e.g. turn count). */
export function rotatingTip(counter: number): string {
  const n = ROTATING_TIPS.length;
  const index = ((Math.floor(counter) % n) + n) % n;
  return ROTATING_TIPS[index];
}
