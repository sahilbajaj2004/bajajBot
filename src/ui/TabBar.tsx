import { Box, Text } from "ink";
import { mixHex, panelTint, theme } from "./theme.js";

export interface TabView {
  id: string;
  title: string;
  /** A turn is streaming in this tab - shown with a spinner glyph. */
  running: boolean;
}

/** Cells painted per gradient step - 2 is smooth without flooding the tree. */
const GRADIENT_STEP = 2;

/** The active tab's frosted surface, lit from the left and fading right. */
const ACTIVE_FROM = 0.3;
const ACTIVE_TO = 0.1;
/** Inactive tabs get the same surface, barely lifted. */
const INACTIVE_TINT = 0.09;

/** `cells` worth of background colours stepping from `from` to `to`. */
export function gradientSteps(from: string, to: string, cells: number): string[] {
  const steps = Math.max(1, Math.ceil(cells / GRADIENT_STEP));
  return Array.from({ length: steps }, (_unused, index) =>
    mixHex(from, to, steps === 1 ? 0 : index / (steps - 1)),
  );
}

/** Text painted over a horizontal gradient, one background per step. */
function GradientText({
  text,
  from,
  to,
  bold,
}: {
  text: string;
  from: string;
  to: string;
  bold?: boolean;
}) {
  if (text === "") return null;
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += GRADIENT_STEP) {
    chunks.push(text.slice(index, index + GRADIENT_STEP));
  }
  const colors = gradientSteps(from, to, text.length);
  return (
    <>
      {chunks.map((chunk, index) => (
        <Text
          key={index}
          backgroundColor={colors[index] ?? colors[colors.length - 1]}
          // Pinned light: the surface is dark whatever the terminal background
          // is, so inheriting the foreground could leave this unreadable.
          color="#ffffff"
          bold={bold}
        >
          {chunk}
        </Text>
      ))}
    </>
  );
}

export interface TabLayout {
  /** Tab ids rendered left-to-right this frame. */
  visible: string[];
  /**
   * Total cells per visible tab, chrome included - exactly what the tab
   * renders in, so clicks map without guessing.
   */
  widths: number[];
  hiddenLeft: number;
  hiddenRight: number;
}

const MIN_TITLE = 6;
const MAX_TITLE = 26;
/** Cells taken by the trailing " + " new-tab affordance. */
const NEW_BUTTON_CELLS = 3;
/** Cells taken by a "‹ " / " ›" overflow marker. */
const ARROW_CELLS = 2;

/** What a click at a given column of the strip means. */
export type TabAction =
  | { kind: "new" }
  | { kind: "select"; id: string }
  | { kind: "close"; id: string };

/** Title with whitespace collapsed, never empty. */
export function normalizeTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim() || "new chat";
}

/** Title fitted to `width` cells, with a trailing ellipsis when clipped. */
export function tabTitle(raw: string, width: number): string {
  const clean = normalizeTitle(raw);
  if (width <= 0) return "";
  if (clean.length <= width) return clean;
  return width === 1 ? clean.slice(0, 1) : `${clean.slice(0, width - 1)}…`;
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/**
 * Cells a tab spends on chrome rather than title: a pad each side, the
 * spinner while working, and on the active tab a gap plus the close ×.
 */
function chromeOf(tab: TabView, active: boolean): number {
  return 2 + (tab.running ? 2 : 0) + (active ? 2 : 0);
}

/**
 * Fit tabs into `columns`. Tabs are sized to their titles, so the strip stays
 * compact; when the row runs out, titles shrink evenly and then the strip
 * windows around the active tab with `‹`/`›` markers. The trailing " + "
 * button is always reserved.
 */
export function tabLayout(tabs: TabView[], activeId: string, columns: number): TabLayout {
  const empty = { visible: [], widths: [], hiddenLeft: 0, hiddenRight: 0 };
  if (tabs.length === 0) return empty;
  const isActive = (index: number): boolean => tabs[index].id === activeId;
  const natural = tabs.map((tab) => clamp(normalizeTitle(tab.title).length, MIN_TITLE, MAX_TITLE));
  const cell = (index: number, titleWidth: number): number => titleWidth + chromeOf(tabs[index], isActive(index));
  const cost = (widths: number[]): number =>
    widths.reduce((total, width, index) => total + cell(index, width), 0);

  let titleWidths = [...natural];
  if (NEW_BUTTON_CELLS + cost(titleWidths) > columns) {
    const chromeTotal = tabs.reduce((total, tab, index) => total + chromeOf(tab, isActive(index)), 0);
    const room = columns - NEW_BUTTON_CELLS - chromeTotal;
    const even = clamp(Math.floor(room / tabs.length), MIN_TITLE, MAX_TITLE);
    titleWidths = tabs.map(() => even);
  }

  const fits = (from: number, to: number): boolean => {
    const left = from > 0 ? ARROW_CELLS : 0;
    const right = to < tabs.length ? ARROW_CELLS : 0;
    let inner = 0;
    for (let index = from; index < to; index += 1) inner += cell(index, titleWidths[index]);
    return NEW_BUTTON_CELLS + left + right + inner <= columns;
  };

  let start = 0;
  let end = tabs.length;
  if (!fits(start, end)) {
    // Grow the window outwards from the active tab until it fits.
    const activeIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.id === activeId),
    );
    start = activeIndex;
    end = activeIndex + 1;
    while (start > 0 && !fits(start - 1, end)) start -= 1;
    while (end < tabs.length && !fits(start, end + 1)) end += 1;
    if (!fits(start, end)) {
      start = 0;
      end = 1;
    }
  }

  const visible: string[] = [];
  const widths: number[] = [];
  for (let index = start; index < end; index += 1) {
    visible.push(tabs[index].id);
    widths.push(cell(index, titleWidths[index]));
  }
  return { visible, widths, hiddenLeft: start, hiddenRight: tabs.length - end };
}

/**
 * Map a click column to an action, using the same widths the strip renders.
 * The active tab's final cell is its close button; the last three cells are
 * the new-tab button.
 */
export function tabActionAt(x: number, tabs: TabView[], activeId: string, columns: number): TabAction | null {
  if (x < 0 || tabs.length === 0) return null;
  const layout = tabLayout(tabs, activeId, columns);
  const known = new Set(tabs.map((tab) => tab.id));
  let cursor = 0;
  if (layout.hiddenLeft > 0) {
    if (x < ARROW_CELLS) return null;
    cursor += ARROW_CELLS;
  }
  for (let index = 0; index < layout.visible.length; index += 1) {
    const id = layout.visible[index];
    const total = layout.widths[index];
    if (id === undefined || total === undefined || !known.has(id)) break;
    if (x < cursor + total) {
      if (id === activeId && x === cursor + total - 1) return { kind: "close", id };
      return { kind: "select", id };
    }
    cursor += total;
  }
  if (layout.hiddenRight > 0) {
    if (x < cursor + ARROW_CELLS) return null;
    cursor += ARROW_CELLS;
  }
  if (x >= cursor && x < cursor + NEW_BUTTON_CELLS) return { kind: "new" };
  return null;
}

export function TabBar({
  tabs,
  activeId,
  columns,
  frame,
  showClose = true,
}: {
  tabs: TabView[];
  activeId: string;
  columns: number;
  /** Spinner glyph for the tab that is streaming. */
  frame: string;
  /**
   * Paint the active tab's close button. The cell is always reserved, so
   * toggling this never shifts the strip under the pointer.
   */
  showClose?: boolean;
}) {
  const layout = tabLayout(tabs, activeId, columns);
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  return (
    <Box flexDirection="row">
      {layout.hiddenLeft > 0 ? <Text dimColor>{"‹ "}</Text> : null}
      {layout.visible.map((id, index) => {
        const tab = byId.get(id);
        const total = layout.widths[index];
        if (!tab || total === undefined) return null;
        const active = id === activeId;
        // Pad to the budget so the tab occupies exactly the cells the layout
        // promised - the click mapping depends on it.
        const title = total - chromeOf(tab, active) - (tab.running ? 2 : 0);
        const body = tabTitle(tab.title, title).padEnd(title);
        const text = tab.running ? `${frame} ${body}` : body;
        if (!active) {
          return (
            <Text key={id} backgroundColor={panelTint(INACTIVE_TINT)} dimColor>
              {` ${text} `}
            </Text>
          );
        }
        return (
          <Box key={id} flexDirection="row">
            <GradientText
              text={` ${text} `}
              from={panelTint(ACTIVE_FROM)}
              to={panelTint(ACTIVE_TO)}
              bold
            />
            {/* Gap plus the close button, outside the tinted surface. Both
                cells are always reserved, so revealing the × on hover never
                shifts the strip. */}
            {showClose ? (
              <>
                <Text> </Text>
                <Text color={theme.accent} bold>×</Text>
              </>
            ) : (
              <Text>  </Text>
            )}
          </Box>
        );
      })}
      {layout.hiddenRight > 0 ? <Text dimColor>{" ›"}</Text> : null}
      <Text color={theme.accent} bold>{" + "}</Text>
    </Box>
  );
}
