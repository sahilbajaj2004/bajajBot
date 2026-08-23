import { LOGO_BOTTOM, LOGO_TOP } from "./logo.js";

export interface ExitSummary {
  sessionId: string;
  createdAt: string;
}

export function printGoodbye(summary: ExitSummary): void {
  const lines = [
    "",
    LOGO_TOP,
    LOGO_BOTTOM,
    "",
    `  Session   New session - ${summary.createdAt}`,
    `  Continue  bajajbot chat --resume ${summary.sessionId}`,
    "",
  ];
  console.log(lines.join("\n"));
}
