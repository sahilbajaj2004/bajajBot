/** Window (ms) in which a second esc press confirms the interrupt. */
export const DOUBLE_ESC_MS = 2500;

/**
 * Two-stage interrupt: the first esc only "arms" (warn on the bottom bar),
 * a second esc inside the window actually aborts. Pure so it is testable.
 */
export function escAction(armedUntil: number | null, now: number): "abort" | "arm" {
  return armedUntil != null && now <= armedUntil ? "abort" : "arm";
}
