import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

/** Isolated HOME so smoke runs never touch the real ~/.bajajbot. */
export const HOME_TMP = (() => {
  const dir = mkdtempSync(`${tmpdir()}/bajajbot-smoke-`);
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
})();
