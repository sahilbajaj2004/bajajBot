export interface ExitSummary {
  sessionId: string;
  createdAt: string;
}

export function printGoodbye(summary: ExitSummary): void {
  const lines = [
    "",
    "█▄▄ ▄▀█   █ ▄▀█   █ █▄▄ █▀█ ▀█▀",
    "█▄█ █▀█ █▄█ █▀█ █▄█ █▄█ █▄█  █ ",
    "",
    `  Session   New session - ${summary.createdAt}`,
    `  Continue  bajajbot chat --resume ${summary.sessionId}`,
    "",
  ];
  console.log(lines.join("\n"));
}
