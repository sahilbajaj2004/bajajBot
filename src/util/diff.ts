const CONTEXT_LINES = 2;
const MAX_MIDDLE_LINES = 1500;
const MAX_OUTPUT_LINES = 40;

interface Op {
  type: "same" | "del" | "add";
  text: string;
}

/**
 * Unified-style line diff with a couple of context lines. Returns "" when the
 * texts are identical. Pure string in / string out so it works everywhere,
 * including tests and tool confirmation details.
 */
export function unifiedDiff(oldText: string, newText: string): string {
  if (oldText === newText) return "";
  let a = oldText.split("\n");
  let b = newText.split("\n");

  // Large inputs: shrink to the changed middle so LCS stays cheap.
  if (a.length > MAX_MIDDLE_LINES || b.length > MAX_MIDDLE_LINES) {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA--;
      endB--;
    }
    const midA = a.slice(start, endA);
    const midB = b.slice(start, endB);
    if (midA.length > MAX_MIDDLE_LINES || midB.length > MAX_MIDDLE_LINES) {
      return `(files too large to preview — ${midA.length} → ${midB.length} lines in changed region)`;
    }
    a = a.slice(Math.max(0, start - CONTEXT_LINES), Math.min(a.length, endA + CONTEXT_LINES));
    b = b.slice(Math.max(0, start - CONTEXT_LINES), Math.min(b.length, endB + CONTEXT_LINES));
  }

  const ops = diffMiddle(a, b);
  const changed = ops.map((op) => op.type !== "same");
  const marks: number[] = [];
  changed.forEach((isChange, index) => {
    if (!isChange) return;
    for (let k = Math.max(0, index - CONTEXT_LINES); k <= Math.min(ops.length - 1, index + CONTEXT_LINES); k++) {
      if (!marks.includes(k)) marks.push(k);
    }
  });

  const lines: string[] = [];
  let previous = -2;
  for (const index of marks) {
    if (previous !== index - 1 && lines.length) lines.push("  …");
    lines.push(format(ops[index]));
    previous = index;
    if (lines.length >= MAX_OUTPUT_LINES) break;
  }
  if (lines.length >= MAX_OUTPUT_LINES) lines.push("  …");
  return lines.join("\n");
}

function format(op: Op): string {
  const sign = op.type === "add" ? "+" : op.type === "del" ? "-" : " ";
  return `${sign} ${op.text}`;
}

function diffMiddle(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: a[i] });
      i++;
    } else {
      ops.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", text: a[i++] });
  while (j < m) ops.push({ type: "add", text: b[j++] });
  return ops;
}
