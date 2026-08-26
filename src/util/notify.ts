/**
 * Terminal escape-sequence notifications. BEL alone just flashes the window
 * badge; OSC 9 pops a real desktop notification in iTerm2/kitty/WezTerm, and
 * OSC 777 covers rxvt-unicode. Sequences are wrapped in tmux passthrough so
 * they survive inside tmux panes too.
 */

const ANSI_SEQUENCES = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?)/g;
const CONTROL_CHARS = /[\x00-\x1f\x07\\;]/g;

function sanitize(text: string, maxLength: number): string {
  return text.replace(ANSI_SEQUENCES, "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Pure builder so the sequences are testable without a TTY. */
export function notificationSequences(title: string, body: string): string {
  const safeTitle = sanitize(title, 60);
  const safeBody = sanitize(body, 120);
  const tmux = process.env.TMUX ? (sequence: string) => `\x1bPtmux;\x1b${sequence}\x1b\\` : (sequence: string) => sequence;
  return (
    tmux(`\x1b]777;notify;${safeTitle};${safeBody}\x07`) +
    tmux(`\x1b]9;${safeBody}\x07`) +
    "\x07"
  );
}

/** Ring the bell + fire a desktop notification (no-op without a TTY). */
export function notifyTurnDone(ok: boolean, preview: string): void {
  if (!process.stdout.isTTY) return;
  const body = ok
    ? `Reply ready — ${preview || "done"}`
    : `Turn failed — ${preview || "check the chat"}`;
  process.stdout.write(notificationSequences("bajajbot", body));
}
