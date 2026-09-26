import { spawn } from "node:child_process";

const OSC52_MAX = 100_000;

/**
 * Copy text to the system clipboard:
 * 1. OSC 52 escape sequence (works over SSH and in most modern terminals)
 * 2. platform clipboard binary as a fallback (pbcopy / clip / wl-copy / xclip / xsel)
 */
export function copyToClipboard(text: string, stdout?: { write: (chunk: string) => unknown; isTTY?: boolean }): boolean {
  if (!text) return false;
  let delivered = false;
  if (stdout?.isTTY && text.length <= OSC52_MAX) {
    try {
      const payload = Buffer.from(text, "utf8").toString("base64");
      stdout.write(`\x1b]52;c;${payload}\x07`);
      delivered = true;
    } catch {
      // fall through to binaries
    }
  }
  spawnClipboardHelpers(text);
  return delivered;
}

function spawnClipboardHelpers(text: string): void {
  const candidates: string[][] = [];
  switch (process.platform) {
    case "darwin":
      candidates.push(["pbcopy"]);
      break;
    case "win32": {
      // clip handles ASCII well; PowerShell decodes base64 so Unicode survives
      candidates.push(["clip"]);
      const b64 = Buffer.from(text, "utf8").toString("base64");
      if (b64.length <= 30_000) {
        candidates.push([
          "powershell",
          "-NoProfile",
          "-Command",
          `Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')))`,
        ]);
      }
      break;
    }
    default:
      if (process.env.WAYLAND_DISPLAY) candidates.push(["wl-copy"]);
      else {
        candidates.push(["xclip", "-selection", "clipboard", "-in"]);
        candidates.push(["xsel", "--clipboard", "--input"]);
      }
  }
  for (const [command, ...args] of candidates) {
    try {
      const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
      child.on("error", () => {});
      child.stdin.on("error", () => {});
      child.stdin.end(text, "utf8");
      child.unref();
    } catch {
      // helper not installed; OSC 52 already covered the common cases
    }
  }
}
