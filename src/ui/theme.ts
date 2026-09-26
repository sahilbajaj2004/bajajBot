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

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Blend two `#rrggbb` colors: t = 0 returns `from`, t = 1 returns `to`.
 * Non-hex input (a named colour) is returned unchanged.
 */
export function mixHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const amount = clamp01(t);
  const channels = a.map((value, index) =>
    Math.round(value + (b[index] - value) * amount)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${channels.join("")}`;
}

/**
 * Panel colour for the tab strip. Terminals have no alpha channel, so a
 * "translucent" surface is faked by lifting the accent a little off black -
 * which assumes a dark terminal background, like the rest of the UI.
 */
export function panelTint(strength: number): string {
  return mixHex("#000000", theme.accent, strength);
}

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
