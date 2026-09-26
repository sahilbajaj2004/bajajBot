import assert from "node:assert/strict";
import { test } from "node:test";
import { mixHex, panelTint, THEMES, applyTheme, theme, DEFAULT_THEME } from "../src/ui/theme.js";
import { gradientSteps } from "../src/ui/TabBar.js";

test("mixHex returns the endpoints at t=0 and t=1", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0), "#000000");
  assert.equal(mixHex("#000000", "#ffffff", 1), "#ffffff");
});

test("mixHex interpolates each channel", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixHex("#ff0000", "#0000ff", 0.5), "#800080");
  assert.equal(mixHex("#000000", "#ffffff", 0.25), "#404040");
});

test("mixHex clamps t and passes through non-hex colours", () => {
  assert.equal(mixHex("#000000", "#ffffff", -1), "#000000");
  assert.equal(mixHex("#000000", "#ffffff", 2), "#ffffff");
  // Named colours cannot be blended, so the input survives untouched.
  assert.equal(mixHex("red", "#ffffff", 0.5), "red");
  assert.equal(mixHex("#000000", "red", 0.5), "#000000");
});

test("mixHex is case-insensitive and tolerates whitespace", () => {
  assert.equal(mixHex(" #FF0000 ", "#000000", 0.5), "#800000");
});

test("panelTint lifts the accent off black and follows the active theme", () => {
  const before = theme.accent;
  try {
    applyTheme("ember");
    const ember = panelTint(0.3);
    assert.notEqual(ember, "#000000", "a tint must not be pure black");
    assert.ok(ember.startsWith("#"), `expected hex, got ${ember}`);

    applyTheme("ocean");
    assert.notEqual(panelTint(0.3), ember, "the tint follows the accent");
  } finally {
    applyTheme(DEFAULT_THEME);
    assert.equal(theme.accent, before);
  }
});

test("panelTint strength scales with the value", () => {
  const low = panelTint(0.1);
  const high = panelTint(0.3);
  const brightness = (hex: string): number => Number.parseInt(hex.slice(1, 3), 16);
  assert.ok(brightness(high) > brightness(low), "a stronger tint is brighter");
});

test("gradientSteps returns one colour per two cells, first to last", () => {
  const steps = gradientSteps("#000000", "#ffffff", 20);
  assert.equal(steps.length, 10);
  assert.equal(steps[0], "#000000");
  assert.equal(steps[steps.length - 1], "#ffffff");
});

test("gradientSteps handles odd and tiny widths", () => {
  assert.equal(gradientSteps("#000000", "#ffffff", 1).length, 1);
  assert.equal(gradientSteps("#000000", "#ffffff", 5).length, 3);
  assert.equal(gradientSteps("#000000", "#ffffff", 0).length, 1);
  // Never empty, whatever the width.
  assert.ok(gradientSteps("#000000", "#ffffff", 3).length >= 1);
});

test("gradientSteps darkens monotonically from `from` to `to`", () => {
  const steps = gradientSteps("#ff0000", "#000000", 20);
  const brightness = steps.map((hex) => Number.parseInt(hex.slice(1, 3), 16));
  for (let index = 1; index < brightness.length; index += 1) {
    assert.ok(
      brightness[index] <= brightness[index - 1],
      `step ${index} (${brightness[index]}) should not be brighter than ${brightness[index - 1]}`,
    );
  }
});

test("every built-in theme can produce a panel tint", () => {
  const before = theme.accent;
  try {
    for (const name of Object.keys(THEMES)) {
      applyTheme(name);
      assert.match(panelTint(0.3), /^#[0-9a-f]{6}$/, `${name} produced ${panelTint(0.3)}`);
    }
  } finally {
    applyTheme(DEFAULT_THEME);
    assert.equal(theme.accent, before);
  }
});
