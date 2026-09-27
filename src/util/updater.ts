import { spawn } from "node:child_process";
import { isNewerVersion, markUpdateChecked } from "./updateCheck.js";

const REGISTRY_URL = "https://registry.npmjs.org/bajajbot/latest";
const PACKAGE = "bajajbot";
/** npm resolving a large tree can be slow; past this it is stuck, not busy. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface InstallOptions {
  /** Override the command; tests point this at a harmless node script. */
  argv?: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** Called with a short human line as npm produces it. */
  onProgress?: (detail: string) => void;
}

export interface InstallResult {
  ok: boolean;
  code: number | null;
  /** Why it failed, phrased for a status bar (never a raw stack). */
  error?: string;
  /** The last few output lines, for the failure detail. */
  tail: string[];
}

/**
 * The command that installs a version. npm is a `.cmd` shim on Windows and
 * cannot be spawned without the extension there.
 */
export function installArgv(version: string): string[] {
  return [process.platform === "win32" ? "npm.cmd" : "npm", "install", "-g", `${PACKAGE}@${version}`];
}

/** The latest version published on npm, or null if the registry is unreachable. */
export async function latestPublishedVersion(timeoutMs = 5000): Promise<string | null> {
  try {
    const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: unknown };
    return typeof data.version === "string" && data.version ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * Pick the most useful line out of npm's chatter. Warnings come first and say
 * nothing about progress, so a real line wins; failing that, the last non-empty
 * one does.
 */
export function pickProgressLine(lines: string[]): string | null {
  const clean = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (clean.length === 0) return null;
  const meaningful = clean.filter((line) => !/^npm (warn|notice|verb|info)/i.test(line));
  const source = meaningful.length > 0 ? meaningful : clean;
  const last = source[source.length - 1] as string;
  return last.length > 120 ? `${last.slice(0, 117)}…` : last;
}

/** A short, actionable explanation for a failed install. */
export function describeInstallFailure(result: { error?: string; tail: string[]; code: number | null }): string {
  const text = `${result.error ?? ""} ${result.tail.join(" ")}`.toLowerCase();
  if (text.includes("eacces") || text.includes("eperm") || text.includes("permission denied")) {
    return "no permission to write the global install - retry with sudo";
  }
  // Checked before the "command not found" case: npm's 404 body also says
  // "Not Found", and that means an unknown version, not a missing npm.
  if (text.includes("e404") || text.includes("404 not found") || text.includes("no such version")) {
    return "that version is not on the registry";
  }
  if (text.includes("enoent") || text.includes("command not found") || text.includes("is not recognized")) {
    return `${PACKAGE} could not run npm - is Node installed and on PATH?`;
  }
  if (
    text.includes("etimedout") ||
    text.includes("enotfound") ||
    text.includes("network") ||
    text.includes("econnreset")
  ) {
    return "the registry could not be reached - check the network and retry";
  }
  return `npm exited with code ${result.code ?? "?"}`;
}

/** Whether a published version is worth installing over what is running. */
export function shouldInstall(current: string, latest: string): boolean {
  return isNewerVersion(current, latest);
}

/**
 * The three things `/update` needs from the outside world. Injecting this is
 * how the TUI's progress display is tested without running a real global
 * install against a real registry.
 */
export interface Updater {
  latest(): Promise<string | null>;
  install(version: string, onProgress: (detail: string) => void): Promise<InstallResult>;
  /** Record that a check just happened, so the startup banner stays quiet. */
  markChecked(version: string): void;
}

/**
 * Run the install, streaming progress. Never throws: a failed update has to
 * read as a failed update, not as a crashed chat.
 */
export function installVersion(version: string, options: InstallOptions = {}): Promise<InstallResult> {
  const argv = options.argv ?? installArgv(version);
  const [command, ...args] = argv;
  if (!command) {
    return Promise.resolve({ ok: false, code: null, error: "nothing to run", tail: [] });
  }
  return new Promise<InstallResult>((resolve) => {
    const tail: string[] = [];
    let settled = false;
    const finish = (result: InstallResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      finish({ ok: false, code: null, error: message, tail });
      return;
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        code: null,
        error: `timed out after ${Math.round((options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000)}s`,
        tail: [...tail],
      });
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const collect = (chunk: Buffer | string): void => {
      for (const line of String(chunk).split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        tail.push(trimmed);
        if (tail.length > 12) tail.shift();
        const detail = pickProgressLine([trimmed]);
        if (detail) options.onProgress?.(detail);
      }
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);

    child.on("error", (cause: Error) => {
      finish({ ok: false, code: null, error: cause.message, tail: [...tail] });
    });
    child.on("close", (code) => {
      finish({ ok: code === 0, code, tail: [...tail] });
    });
  });
}

/** The real updater: npm's registry and a real global install. */
export const npmUpdater: Updater = {
  latest: () => latestPublishedVersion(),
  install: (version, onProgress) => installVersion(version, { onProgress }),
  markChecked: (version) => {
    markUpdateChecked(version);
  },
};
