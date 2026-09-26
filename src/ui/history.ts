export function cycleHistory(
  history: string[],
  index: number | null,
  direction: -1 | 1,
): { draft: string; index: number | null } {
  if (!history.length) return { draft: "", index: null };
  if (direction === -1) {
    const next = index === null ? history.length - 1 : Math.max(0, index - 1);
    return { draft: history[next], index: next };
  }
  if (index === null) return { draft: "", index: null };
  const next = index + 1;
  return next >= history.length ? { draft: "", index: null } : { draft: history[next], index: next };
}
