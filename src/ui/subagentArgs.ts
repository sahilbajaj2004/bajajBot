/** Parsed `/subagent` arguments. */
export interface SubagentArgs {
  /** Batch model from --model; undefined means "use the session's model". */
  model?: string;
  tasks: { task: string; model?: string }[];
}

/**
 * Parse `/subagent` arguments: a comma/pipe/newline separated task list, an
 * optional `--model <id>` for the whole batch, and an optional `<id>::` prefix
 * on a single task to override just that one.
 *
 * The prefix uses a double colon because task text routinely contains single
 * colons ("find TODO: fix this") and guessing there would silently misroute a
 * task onto a nonexistent model.
 */
export function parseSubagentArgs(input: string): SubagentArgs {
  // Lift the batch model out of the raw string first: the flag and its value
  // are space-separated, but tasks are comma-separated and full of spaces, so
  // the flag cannot be found by looking at split parts.
  let rest = input;
  let model: string | undefined;
  const flag = /(^|\s)(?:--model|-m)(?:[=\s]+)(\S+)/.exec(input);
  if (flag) {
    model = flag[2];
    rest = `${input.slice(0, flag.index)}${input.slice(flag.index + flag[0].length)}`;
  }
  const tasks: SubagentArgs["tasks"] = [];
  for (const part of rest
    .split(/\s*[|,]\s*|\n+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    // A flag with no value left is a typo, not a task - running it would send
    // the literal word "--model" off to the model as a prompt.
    .filter((piece) => piece !== "--model" && piece !== "-m")) {
    // The prefix may not contain whitespace, so "find Foo::bar" stays a task
    // rather than being read as a model called "find Foo".
    const split = /^([^\s:]+)::\s*(\S.*)$/.exec(part);
    if (split) {
      tasks.push({ task: split[2].trim(), model: split[1] });
      continue;
    }
    tasks.push({ task: part });
  }
  return { model, tasks };
}

/**
 * Describe the models a batch runs on: the single shared model, or a count when
 * the units are mixed. Used for the chip header and the final report line.
 */
export function describeBatchModel(models: string[], fallback: string): string {
  const distinct = new Set(models);
  if (distinct.size === 0) return fallback;
  if (distinct.size === 1) return [...distinct][0] as string;
  return `${distinct.size} models`;
}
