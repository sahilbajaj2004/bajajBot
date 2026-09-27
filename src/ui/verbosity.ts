/**
 * Transcript verbosity: how much of each tool call the chat shows.
 *
 *   quiet   (default) one line per call and one line per result - the call's
 *                      first argument and the result's first line.
 *   normal            quiet, plus the full arguments the agent asked with.
 *   verbose           normal, plus the whole result body instead of its head.
 *
 * Every level renders the same content, so switching verbosity never changes
 * what a selection copies or what the model is sent - only how much of it the
 * viewport draws.
 */
export type Verbosity = "quiet" | "normal" | "verbose";

export const VERBOSITY_LEVELS: readonly Verbosity[] = ["quiet", "normal", "verbose"];

/** Anything unrecognized (or missing) is quiet, so a bad config cannot break the chat. */
export function normalizeVerbosity(value: unknown): Verbosity {
  return VERBOSITY_LEVELS.includes(value as Verbosity) ? (value as Verbosity) : "quiet";
}

/** quiet -> normal -> verbose -> quiet. */
export function nextVerbosity(current: Verbosity): Verbosity {
  const index = VERBOSITY_LEVELS.indexOf(current);
  return VERBOSITY_LEVELS[(index + 1) % VERBOSITY_LEVELS.length] as Verbosity;
}

/** Show the whole argument object under a tool call. */
export function showsToolArgs(level: Verbosity): boolean {
  return level !== "quiet";
}

/** Show the whole result body under a tool result. */
export function showsToolOutput(level: Verbosity): boolean {
  return level === "verbose";
}

/**
 * Cap on expanded detail lines per call or result. Verbose is meant to be
 * generous, not to bury the conversation under an 8k-character file read - and
 * the whole thing is always still in the session and in `/export`.
 */
export const MAX_DETAIL_LINES = 60;

/** What each level means, for the note after `/verbose` and for `/help`. */
export const VERBOSITY_HELP: Record<Verbosity, string> = {
  quiet: "one line per tool call and result",
  normal: "plus the full tool arguments",
  verbose: "plus whole tool results",
};
