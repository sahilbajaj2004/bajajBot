import type { RouteRule } from "../config/types.js";

export interface RouteMatch {
  rule: RouteRule;
  label: string;
}

/** Compile a pattern string; `/.../ `-wrapped patterns become regexes. */
export function compilePattern(pattern: string): (text: string) => boolean {
  let body: string | undefined;
  if (pattern.length >= 2 && pattern.startsWith("/") && pattern.endsWith("/")) {
    body = pattern.slice(1, -1);
    try {
      const compiled = new RegExp(body, "i");
      return compiled.test.bind(compiled);
    } catch {
      // malformed pattern — fall through to a substring match on the body
    }
  }
  const needle = (body ?? pattern).toLowerCase();
  return (text) => text.toLowerCase().includes(needle);
}

/**
 * First *active* rule whose pattern matches the message wins. Returns null
 * when nothing matches. Pattern matches against the raw user text.
 */
export function matchRoutes(text: string, routes: RouteRule[] | undefined): RouteMatch | null {
  if (!routes || routes.length === 0) return null;
  for (const rule of routes) {
    if (rule.active === false) continue;
    try {
      if (compilePattern(rule.pattern)(text)) {
        return { rule, label: rule.label ?? rule.model };
      }
    } catch {
      // broken rule — skip it rather than breaking every turn
    }
  }
  return null;
}