export const DEFAULT_COLUMNS = 80;
export const DEFAULT_ROWS = 24;

export interface ThemePalette {
  accent: string;
  danger: string;
  success: string;
}

/** Built-in colorways. Keys are valid for `config set theme <name>`. */
export const THEMES: Record<string, ThemePalette> = {
  ember: { accent: "#ff8c42", danger: "red", success: "green" },
  ocean: { accent: "#38bdf8", danger: "#f87171", success: "#34d399" },
  matrix: { accent: "#22c55e", danger: "#ef4444", success: "#a3e635" },
  rose: { accent: "#fb7185", danger: "#e11d48", success: "#4ade80" },
  violet: { accent: "#a78bfa", danger: "#fb7185", success: "#34d399" },
  mono: { accent: "#e5e5e5", danger: "red", success: "green" },
};

export const DEFAULT_THEME = "ember";

/**
 * The live palette every UI component reads at render time. Mutated by
 * applyTheme(); the re-render triggered by the caller picks the new colors up.
 */
export const theme: ThemePalette = { ...THEMES[DEFAULT_THEME] };

/** Switch to a named colorway; returns false for unknown names. */
export function applyTheme(name?: string): boolean {
  if (!name || !THEMES[name]) return false;
  Object.assign(theme, THEMES[name]);
  return true;
}
