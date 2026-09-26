import assert from "node:assert/strict";
import { test } from "node:test";
import { tabActionAt, tabLayout, tabTitle, type TabView } from "../src/ui/TabBar.js";

const tab = (id: string, title: string, running = false): TabView => ({ id, title, running });

test("tabTitle trims, collapses whitespace, and falls back to a placeholder", () => {
  assert.equal(tabTitle("  hello   world ", 20), "hello world");
  assert.equal(tabTitle("   ", 20), "new chat");
});

test("tabTitle clips to width with an ellipsis", () => {
  assert.equal(tabTitle("abcdefghij", 5), "abcd…");
  assert.equal(tabTitle("abc", 5), "abc");
  assert.equal(tabTitle("abcdef", 1), "a");
  assert.equal(tabTitle("abc", 0), "");
});

test("tabLayout fits a handful of tabs without hiding any", () => {
  const tabs = [tab("a", "one"), tab("b", "two"), tab("c", "three")];
  const layout = tabLayout(tabs, "b", 120);
  assert.deepEqual(layout.visible, ["a", "b", "c"]);
  assert.equal(layout.hiddenLeft, 0);
  assert.equal(layout.hiddenRight, 0);
});

test("tabLayout caps the per-tab width so one long title cannot eat the row", () => {
  const layout = tabLayout([tab("a", "x".repeat(200))], "a", 200);
  // Widths are total cells: a 26-char title, two pads, and the active tab's
  // gap plus ×.
  assert.equal(layout.widths[0], 30);
});

test("tabLayout windows around the active tab and counts the hidden ones", () => {
  const tabs = Array.from({ length: 12 }, (_, index) => tab(`t${index}`, `tab ${index}`));
  const layout = tabLayout(tabs, "t7", 80);
  assert.ok(layout.visible.includes("t7"), "active tab stays visible");
  assert.equal(layout.hiddenLeft + layout.visible.length + layout.hiddenRight, 12);
  assert.ok(layout.hiddenLeft > 0 || layout.hiddenRight > 0, "overflow is reported");
});

test("tabLayout keeps the active tab visible at both ends of the strip", () => {
  const tabs = Array.from({ length: 12 }, (_, index) => tab(`t${index}`, `tab ${index}`));
  const first = tabLayout(tabs, "t0", 80);
  assert.equal(first.visible[0], "t0");
  assert.equal(first.hiddenLeft, 0);
  const last = tabLayout(tabs, "t11", 80);
  assert.equal(last.visible[last.visible.length - 1], "t11");
  assert.equal(last.hiddenRight, 0);
});

test("tabLayout never exceeds the terminal width", () => {
  for (const columns of [20, 40, 80, 200]) {
    const tabs = Array.from({ length: 9 }, (_, index) => tab(`t${index}`, `title ${index}`));
    const layout = tabLayout(tabs, "t4", columns);
    const used = layout.widths.reduce((total, width) => total + width, 0);
    assert.ok(used <= columns, `${used} cells used of ${columns}`);
  }
});

test("tabLayout handles an empty strip", () => {
  const layout = tabLayout([], "missing", 80);
  assert.deepEqual(layout.visible, []);
  assert.deepEqual(layout.widths, []);
});

test("tabActionAt maps the trailing cells to the new-tab button", () => {
  const tabs = [tab("a", "one"), tab("b", "two")];
  const layout = tabLayout(tabs, "a", 120);
  const end = layout.widths.reduce((total, width) => total + width, 0);
  for (const x of [end, end + 1, end + 2]) {
    assert.deepEqual(tabActionAt(x, tabs, "a", 120), { kind: "new" });
  }
  // The first cell of the first tab is a selection, not the button.
  assert.deepEqual(tabActionAt(0, tabs, "a", 120), { kind: "select", id: "a" });
  // Past the button there is nothing to hit.
  assert.equal(tabActionAt(end + 3, tabs, "a", 120), null);
});

test("tabActionAt selects whichever tab was clicked", () => {
  const tabs = [tab("a", "one"), tab("b", "two"), tab("c", "three")];
  const layout = tabLayout(tabs, "a", 120);
  let cursor = 0;
  for (const id of layout.visible) {
    const index = layout.visible.indexOf(id);
    const width = layout.widths[index];
    // Anywhere inside a background tab selects it. The active tab reserves
    // its last cell for the close button, so stop one short there.
    const last = id === "a" ? width - 2 : width - 1;
    assert.deepEqual(tabActionAt(cursor, tabs, "a", 120), { kind: "select", id });
    assert.deepEqual(tabActionAt(cursor + last, tabs, "a", 120), { kind: "select", id });
    cursor += width;
  }
});

test("tabActionAt closes the active tab from its last cell only", () => {
  const tabs = [tab("a", "one"), tab("b", "two")];
  const layout = tabLayout(tabs, "a", 120);
  const width = layout.widths[0];
  // The active tab spans [0, width); its final cell is the ×.
  assert.deepEqual(tabActionAt(width - 1, tabs, "a", 120), { kind: "close", id: "a" });
  assert.deepEqual(tabActionAt(width - 2, tabs, "a", 120), { kind: "select", id: "a" });
  // A background tab's last cell still selects - it has no ×.
  assert.deepEqual(tabActionAt(width + layout.widths[1] - 1, tabs, "a", 120), { kind: "select", id: "b" });
});

test("tabActionAt ignores clicks past the strip and on overflow arrows", () => {
  const tabs = Array.from({ length: 12 }, (_, index) => tab(`t${index}`, `tab ${index}`));
  const columns = 80;
  const layout = tabLayout(tabs, "t7", columns);
  assert.ok(layout.hiddenLeft > 0, "fixture should overflow");
  // The "‹ " marker is inert.
  assert.equal(tabActionAt(0, tabs, "t7", columns), null);
  assert.equal(tabActionAt(1, tabs, "t7", columns), null);
  // The first tab starts right after it.
  assert.deepEqual(tabActionAt(2, tabs, "t7", columns), { kind: "select", id: layout.visible[0] });
  // Beyond the last cell there is nothing to hit.
  assert.equal(tabActionAt(columns + 20, tabs, "t7", columns), null);
});

test("tabActionAt is safe with no tabs or a negative column", () => {
  assert.equal(tabActionAt(0, [], "missing", 80), null);
  assert.equal(tabActionAt(-1, [tab("a", "one")], "a", 80), null);
});

test("tabActionAt hits every rendered cell of a wide strip", () => {
  // No gaps: each column from the first tab through the + resolves to an action.
  const tabs = [tab("a", "one"), tab("b", "two")];
  const columns = 120;
  const layout = tabLayout(tabs, "a", columns);
  const end = layout.widths.reduce((total, width) => total + width, 0) + 3;
  for (let x = 0; x < end; x += 1) {
    assert.notEqual(tabActionAt(x, tabs, "a", columns), null, `column ${x} should be actionable`);
  }
});
