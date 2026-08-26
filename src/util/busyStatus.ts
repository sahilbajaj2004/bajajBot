/**
 * Live status for the spinner row while a turn runs. Char count stands in for
 * tokens (~4 chars each) because real usage numbers only arrive at turn end.
 */
export function busyStatus(elapsedSeconds: number, streamedChars: number): string {
  const seconds = `${Math.max(0, Math.floor(elapsedSeconds))}s`;
  if (streamedChars <= 0) return `${seconds} · waiting for first token`;
  return `${seconds} · ${Math.max(1, Math.round(streamedChars / 4))} tok`;
}
