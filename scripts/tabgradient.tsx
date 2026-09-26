let lastFrame: string[] = [];
import { render } from "ink";
import { createElement } from "react";
import chalk from "chalk";
import { TabBar, type TabView } from "../src/ui/TabBar.js";
import { FrameStdout } from "./frame-stdout.js";
import { HOME_TMP } from "./harness.js";
import { applyTheme, THEMES } from "../src/ui/theme.js";
import { gradientSteps } from "../src/ui/TabBar.js";

// The fake stream reports no colour support, so ask chalk for truecolor -
// otherwise every background comes out blank and there is nothing to inspect.
chalk.level = 3;

const tabs: TabView[] = [
  { id: "a", title: "Latest OpenCode updates over two hundred chars of title", running: true },
  { id: "b", title: "refactor the session store", running: false },
  { id: "c", title: "fix flaky tests", running: false },
];

/** Background colours painted on the strip row, in order. */
function stripBackgrounds(): string[] {
  // The strip is the first row, so scan every write the strip could be in.
  const text = lastFrame.join("");
  const row = text.split("\n")[0] ?? "";
  return [...row.matchAll(/48;2;(\d+);(\d+);(\d+)/g)].map((match) =>
    `${Number(match[1])},${Number(match[2])},${Number(match[3])}`,
  );
}



console.log(`HOME=${HOME_TMP}`);

for (const name of Object.keys(THEMES)) {
  applyTheme(name);
  const stdout = new FrameStdout(80, 10);
  const view = render(createElement(TabBar, { tabs, activeId: "a", columns: 80, frame: "⠋", showClose: true }), {
    stdout,
    debug: true,
  });
  view.unmount();
  lastFrame = stdout.frames;
  const colors = stripBackgrounds();
  const unique = [...new Set(colors)];
  console.log(
    `${name.padEnd(7)} cells=${String(colors.length).padStart(3)} distinct=${String(unique.length).padStart(3)}` +
      ` first=${unique[0] ?? "-"} last=${unique[unique.length - 1] ?? "-"}`,
  );
}

// The active tab must fade left-to-right, and the hover-only cross must not
// change the cell count.
applyTheme("ember");
const paint = (showClose: boolean): string[] => {
  const stdout = new FrameStdout(80, 10);
  const view = render(createElement(TabBar, { tabs, activeId: "a", columns: 80, frame: "⠋", showClose }), {
    stdout,
    debug: true,
  });
  view.unmount();
  lastFrame = stdout.frames;
  return stripBackgrounds();
};
const hidden = paint(false);
const shown = paint(true);
console.log("cells without cross:", hidden.length, "with cross:", shown.length);
console.log("same cell count:", hidden.length === shown.length);

const steps = gradientSteps("#000000", "#ffffff", 20);
console.log("gradient over 20 cells:", steps.join(" "));

// The active tab must fade monotonically from lit to dark, left to right.
applyTheme("ember");
lastFrame = [];
{
  const stdout = new FrameStdout(80, 10);
  const view = render(createElement(TabBar, { tabs, activeId: "a", columns: 80, frame: "⠋" }), {
    stdout,
    debug: true,
  });
  view.unmount();
  lastFrame = stdout.frames;
}
const row = (lastFrame.join("").split("\n")[0] ?? "");
const luminance = (rgb: string): number => {
  const [r = 0, g = 0, b = 0] = rgb.split(",").map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const activeCells = stripBackgrounds().map(luminance);
// The active tab is the widest run of tinted cells at the left of the strip.
const run: number[] = [];
for (const value of activeCells) {
  if (run.length === 0 || value <= run[run.length - 1] + 12) run.push(value);
  else break;
}
const fading = run.slice(1).every((value, index) => value <= run[index] + 1);
console.log(`active tab cells=${run.length} first=${run[0]?.toFixed(1)} last=${run[run.length - 1]?.toFixed(1)}`);
console.log("fades left to right:", fading && (run[0] ?? 0) > (run[run.length - 1] ?? 0));
console.log("active text is pinned light:", /\x1b\[38;2;255;255;255m/.test(row));
process.exit(0);
