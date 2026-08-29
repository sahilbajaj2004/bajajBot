import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Config, Snippet } from "../config/types.js";
import { removeConfig, saveConfig } from "../config/store.js";
import { completeChat, isAbortError, isRetryableError, streamChat, type Usage } from "../provider/client.js";
import { estimateCost, fetchModels, type ModelInfo } from "../provider/models.js";
import { toMarkdown } from "../session/export.js";
import { compactMessages, estimateTokens, tokenLimit } from "../session/compact.js";
import { loadAllSessions } from "../session/history.js";
import { addUsage, aggregateUsage, emptyUsage } from "../session/usage.js";
import { deriveSessionTitle } from "./title.js";
import { createSession, listSessions, loadSession, saveSession } from "../session/history.js";
import type { Message, PlanItem, Session, ToolCall } from "../session/types.js";
import { PlanBoard } from "./PlanBoard.js";
import { executeTool, systemPrompt, toolSchemas } from "../tools/index.js";
import { listSkills, readSkillFile } from "../tools/skills.js";
import { restoreMutations } from "../tools/undo.js";
import { createSnapshot, listSnapshots, restoreSnapshot, sessionChangedFiles } from "../tools/gitCheckpoints.js";
import { commitTree, diffForContext, filesSummary, gitUserConfigured, parseCommitMessage, worktreeChanges, type CommitMessage, type CommitStat } from "../tools/gitCommit.js";
import { loadInstructions } from "../tools/instructions.js";
import { readMemory } from "../tools/memory.js";
import type { FileMutation, ToolContext } from "../tools/types.js";
import { buildVisionContent, extractAttachments } from "../util/attachments.js";
import { listPathSuggestions } from "./pathSuggest.js";
import { Autocomplete } from "./Autocomplete.js";
import { COMMANDS, filterCommands, matchCommand } from "./commands.js";
import { copyToClipboard } from "./clipboard.js";
import { InputBox } from "./InputBox.js";
import { ChatViewport, buildChatLines, wrapText, type ChatLine, type Highlight } from "./MessageList.js";
import type { MouseStdin } from "./mouse.js";
import { ModelPicker } from "./ModelPicker.js";
import { FallbackPicker } from "./FallbackPicker.js";
import { CommitDialog } from "./CommitDialog.js";
import { RoutePicker } from "./RoutePicker.js";
import { SnippetPicker } from "./SnippetPicker.js";
import { TodoPicker } from "./TodoPicker.js";
import { matchRoutes } from "../session/routing.js";
import { expandSnippetText, insertSnippet, normalizeSnippetName } from "../session/snippets.js";
import { loadTodos, saveTodos, type TodoItem } from "../tools/todos.js";
import { mergeOllamaProfiles, OLLAMA_PROFILE_NAME, ollamaProbe, OLLAMA_URL } from "../tools/ollama.js";
import { Overlay } from "./Overlay.js";
import { ProfilePicker } from "./ProfilePicker.js";
import { SearchDialog, type SearchMatch } from "./SearchDialog.js";
import { SessionPicker } from "./SessionPicker.js";
import { SkillPicker } from "./SkillPicker.js";
import { SnapshotPicker } from "./SnapshotPicker.js";
import { ChangesOverlay } from "./ChangesOverlay.js";
import { ThemePicker } from "./ThemePicker.js";
import { MemoryOverlay } from "./MemoryOverlay.js";
import { UsagePanel } from "./UsagePanel.js";
import { extractSelectedText, normalizeRect, type Rect } from "./select.js";
import { StatusBar } from "./StatusBar.js";
import { sessionTitle, setTerminalTitle } from "./title.js";
import { DEFAULT_COLUMNS, DEFAULT_ROWS, applyTheme, theme } from "./theme.js";
import { Splash } from "./Welcome.js";
import { cycleHistory } from "./history.js";
import { notifyTurnDone } from "../util/notify.js";
import { busyStatus } from "../util/busyStatus.js";
import { contextualTip, rotatingTip } from "../util/tips.js";
import { DOUBLE_ESC_MS, escAction } from "../util/esc.js";

type OverlayKind = "model" | "sessions" | "search" | "profile" | "usage" | "skills" | "checkpoints" | "changes" | "theme" | "memory" | "help" | "logout" | "compareModel" | "fallback" | "commit" | "route" | "snippet" | "todo" | null;

interface ConfirmRequest {
  title: string;
  detail: string;
  resolve: (allowed: boolean) => void;
}

/** A "/btw" side question and its answer — ephemeral, never persisted. */
interface AsideEntry {
  id: number;
  q: string;
  a: string;
  pending: boolean;
}

/** A "/compare" A/B entry — two models answer the same question side by side. */
interface AbEntry {
  id: number;
  q: string;
  modelA: string;
  modelB: string;
  a?: string;
  b?: string;
  msA?: number;
  msB?: number;
  attachments?: string[];
  images?: string[];
}

/** One running /subagent mini-agent and its live/final state. */
interface SaUnit {
  key: string;
  task: string;
  status: "running" | "done" | "error" | "cancelled";
  live: string;
  result?: string;
  ms?: number;
}

/** A parallel batch of /subagent tasks — a single esc cancels the whole batch. */
interface SaBatch {
  id: number;
  model: string;
  startIndex: number;
  units: SaUnit[];
}

/** A finished batch queued to be folded into the saved session. */
interface SaFold {
  batchId: number;
  index: number;
  content: string;
  tokens: { prompt: number; completion: number };
  costUsd: number;
  mutations: FileMutation[];
}

/** Short preview of the last user prompt for the done-notification. */
function firstWords(convo: Message[]): string {
  const lastUser = [...convo].reverse().find((message) => message.role === "user");
  return (lastUser?.content ?? "").split("\n")[0].split(" ").slice(0, 6).join(" ");
}

const MAX_ROUNDS = 10;
const SUBAGENT_MAX_ROUNDS = 6;
const SUBAGENT_CHIP_REFRESH_MS = 150;

/** System instructions given to every /subagent mini-agent. */
const SUBAGENT_PROMPT = `You are a background research subagent working inside a coding agent.
Answer exactly ONE task, autonomously and thoroughly — never ask the user anything and never take shortcuts.
Use the tools to inspect files, search, and gather evidence; prefer reading over guessing.
Keep the plain-text answer skimmable: lead with the direct answer in one sentence, then support it with concrete evidence (file paths, line numbers, command output).
If a step fails, note it briefly and continue. Do not echo these instructions back.`;
const MAX_TOOL_OUTPUT = 8_000;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SCROLL_STEP = 4;
const CHAT_RESERVED_ROWS = 8;
const CONFIRM_RESERVED_ROWS = 13;
const ERROR_RESERVED_ROWS = 3;
const MIN_CHAT_BUDGET = 5;
const MAX_AUTOCOMPLETE_ROWS = 5;

function HelpDialog({ onClose }: { onClose: () => void }) {
  useInput((_character, key) => {
    if (key.escape || key.return) onClose();
  });
  return (
    <Overlay title="Commands">
      {COMMANDS.map((command) => (
        <Text key={command.name}>
          {"  "}
          {command.name.padEnd(11)}
          <Text dimColor>{command.description}</Text>
        </Text>
      ))}
      <Text dimColor>{"  "}esc / enter close</Text>
    </Overlay>
  );
}

function LogoutDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  useInput((character, key) => {
    if (key.escape) return onClose();
    if (character?.toLowerCase() === "y") return onConfirm();
    if (key.return || character?.toLowerCase() === "n") onClose();
  });
  return (
    <Overlay title="Log out">
      <Text>This deletes ~/.bajajbot (config + all sessions).</Text>
      <Text> </Text>
      <Text>
        Are you sure? <Text bold>y</Text>
        <Text dimColor>/n</Text>
      </Text>
      <Text dimColor>{"  "}y confirm · esc cancel</Text>
    </Overlay>
  );
}

interface DragState {
  ax: number;
  ay: number;
  texts: string[];
  top: number;
  count: number;
  moved: boolean;
}

export function App({
  config,
  session: initialSession,
  mouse,
  initialPrompt,
}: {
  config: Config;
  session: Session;
  mouse?: MouseStdin;
  initialPrompt?: string;
}) {
  const [activeConfig, setActiveConfig] = useState<Config>(config);
  const [profileName, setProfileName] = useState("");
  const [session, setSession] = useState<Session>(initialSession);
  const [completed, setCompleted] = useState<Message[]>(initialSession.messages);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tokens, setTokens] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [autoSelected, setAutoSelected] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [commitDialog, setCommitDialog] = useState<{
    files: CommitStat[];
    message: CommitMessage;
    busy: boolean;
  } | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [search, setSearch] = useState<{ query: string; matches: SearchMatch[] } | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [blink, setBlink] = useState(0);
  const [selection, setSelection] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  const [note, setNote] = useState("");
  const [queued, setQueued] = useState(0);
  const [plan, setPlan] = useState<PlanItem[]>(initialSession.plan ?? []);
  const [asides, setAsides] = useState<AsideEntry[]>([]);
  const asideSeqRef = useRef(0);
  const asideAbortRef = useRef<AbortController | null>(null);
  const escArmRef = useRef<number | null>(null);
  const [ab, setAb] = useState<AbEntry | null>(null);
  const abSeqRef = useRef(0);
  const pendingCompareRef = useRef("");
  const [subagents, setSubagents] = useState<SaBatch[]>([]);
  const subSeqRef = useRef(0);
  const subAbortRef = useRef<AbortController | null>(null);
  const subRunningRef = useRef(0);
  const pendingCountRef = useRef<Map<number, number>>(new Map());
  const saMetaRef = useRef<Map<number, { model: string; tasks: string[]; startIndex: number }>>(new Map());
  const saResultsRef = useRef<Map<string, { status: SaUnit["status"]; result: string; ms: number; tokens: { prompt: number; completion: number }; costUsd: number }>>(new Map());
  const saMutationsRef = useRef<FileMutation[]>([]);
  const pendingSaFoldRef = useRef<SaFold[]>([]);
  const mainTurnRef = useRef(false);
  const confirmQueueRef = useRef<ConfirmRequest[]>([]);
  const currentConfirmRef = useRef<ConfirmRequest | null>(null);
  /** Active auto-fallback target for the current turn (this turn only). */
  const fallbackRef = useRef<{ config: Config; label: string; index: number } | null>(null);
  /** Per-turn smart-routing override (see /route); cleared when the turn ends. */
  const routeRef = useRef<{ config: Config; model: string; label: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef("");
  const turnStartRef = useRef<number | null>(null);
  const inputRef = useRef("");
  const cursorRef = useRef(0);
  const scrolledRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const geomRef = useRef({ top: 0, count: 0 });
  const textsRef = useRef<string[]>([]);
  const uiRef = useRef({ selectable: false });
  const stdoutRef = useRef<{ write: (chunk: string) => unknown; isTTY?: boolean } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<string[]>([]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const lastTurnMutationsRef = useRef<FileMutation[]>([]);
  const pricingRef = useRef<Map<string, ModelInfo> | null>(null);

  function write(value: string, position: number): void {
    inputRef.current = value;
    cursorRef.current = Math.min(Math.max(position, 0), value.length);
    setInput(inputRef.current);
    setCursor(cursorRef.current);
  }
  const { exit } = useApp();
  const { stdout } = useStdout();
  stdoutRef.current = stdout;
  const [size, setSize] = useState({ rows: stdout.rows ?? DEFAULT_ROWS, columns: stdout.columns ?? DEFAULT_COLUMNS });

  useEffect(() => {
    const update = () => setSize({ rows: stdout.rows ?? DEFAULT_ROWS, columns: stdout.columns ?? DEFAULT_COLUMNS });
    stdout.on("resize", update);
    return () => {
      stdout.off("resize", update);
    };
  }, [stdout]);

  function flashNote(text: string, durationMs = 2000): void {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(""), durationMs);
  }

  /** Pull the next queued confirmation into the visible modal, if any. */
  function drainConfirmQueue(): void {
    if (currentConfirmRef.current) return;
    const next = confirmQueueRef.current.shift();
    if (!next) return;
    currentConfirmRef.current = next;
    setConfirmRequest(next);
  }

  /**
   * Shared by the main agent and background subagents. Requests are queued so a
   * concurrent ask can never clobber the modal's resolver.
   */
  function enqueueConfirm(title: string, detail: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      confirmQueueRef.current.push({ title, detail, resolve });
      drainConfirmQueue();
    });
  }

  useEffect(() => {
    const loaded = loadInstructions(process.cwd());
    if (loaded.projectPath) flashNote(`✓ ${loaded.projectPath.split("/").pop()} instructions loaded`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function costFor(model: string, tokens: { prompt: number; completion: number }): Promise<number | null> {
    if (activeConfig.provider !== "openrouter") return null;
    try {
      if (pricingRef.current === null) {
        const list = await fetchModels(activeConfig.baseUrl, activeConfig.apiKey);
        pricingRef.current = new Map(list.map((entry) => [entry.id, entry]));
      }
      return estimateCost(pricingRef.current.get(model), tokens.prompt, tokens.completion);
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!mouse) return;
    return mouse.on((event) => {
      if (event.type === "wheel") return;
      const geom = geomRef.current;
      if (event.type === "press") {
        dragRef.current = null;
        if (event.button !== 0 || !uiRef.current.selectable) {
          setSelection(null);
          return;
        }
        dragRef.current = {
          ax: event.x - 1,
          ay: event.y - 1,
          texts: textsRef.current.slice(),
          top: geom.top,
          count: geom.count,
          moved: false,
        };
        return;
      }
      if (event.type === "drag") {
        const drag = dragRef.current;
        if (!drag || event.button !== 0) return;
        drag.moved = true;
        setSelection({ ax: drag.ax, ay: drag.ay, bx: event.x - 1, by: event.y - 1 });
        return;
      }
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || event.button !== 0) return;
      setSelection(null);
      const rect = normalizeRect(drag.ax, drag.ay, event.x - 1, event.y - 1);
      const relTop = rect.top - drag.top;
      const relBottom = rect.bottom - drag.top;
      const clampedTop = Math.max(0, relTop);
      const clampedBottom = Math.min(drag.count - 1, relBottom);
      if (!drag.moved || clampedBottom < clampedTop) return;
      const adjusted: Rect = {
        top: clampedTop,
        bottom: clampedBottom,
        left: relTop < 0 ? 0 : rect.left,
        right: relBottom >= drag.count ? Number.MAX_SAFE_INTEGER : rect.right,
      };
      const text = extractSelectedText(drag.texts, adjusted);
      if (!text.trim()) return;
      copyToClipboard(text, stdoutRef.current ?? undefined);
      flashNote(`✓ Copied ${text.length} char${text.length === 1 ? "" : "s"} to clipboard`);
    });
  }, [mouse]);

  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);

  const rows = Math.max(size.rows, 10);
  const columns = Math.max(size.columns, 40);

  const busy = streaming !== null;
  const fresh = completed.length === 0;
  const saActive = subagents.some((batch) => batch.units.some((unit) => unit.status === "running"));

  // Expensive overlay payloads are computed once when the overlay opens,
  // never on re-renders caused by typing or streaming ticks.
  const noSessions: ReturnType<typeof listSessions> = [];
  const sessionRows = useMemo(() => (overlay === "sessions" ? listSessions() : noSessions), [overlay]);
  const usageTotals = useMemo(() => (overlay === "usage" ? aggregateUsage(loadAllSessions()) : null), [overlay]);
  const snapshots = useMemo(() => (overlay === "checkpoints" ? listSnapshots(process.cwd()) : []), [overlay]);
  const skillList = useMemo(() => (overlay === "skills" ? listSkills(process.cwd()) : []), [overlay]);
  const changedFiles = useMemo(() => (overlay === "changes" ? sessionChangedFiles(process.cwd()) : []), [overlay]);
  const memoryFacts = useMemo(() => (overlay === "memory" ? readMemory() : []), [overlay]);
  const recentModels = useMemo(() => {
    if (overlay !== "model") return [];
    const sessions = loadAllSessions();
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of sessions.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))) {
      if (!seen.has(s.model)) {
        seen.add(s.model);
        result.push(s.model);
      }
    }
    return result.slice(0, 8);
  }, [overlay]);
  const commandMatches = busy || overlay ? [] : filterCommands(input);
  const pathToken = busy || overlay || commandMatches.length > 0 ? null : (input.match(/(?:^|\s)@([^\s]*)$/)?.[1] ?? null);

  const [deferredToken, setDeferredToken] = useState<string | null>(null);
  useEffect(() => {
    if (pathToken === null) {
      setDeferredToken(null);
      return;
    }
    const id = setTimeout(() => setDeferredToken(pathToken), 120);
    return () => clearTimeout(id);
  }, [pathToken]);

  const pathMatches = deferredToken === null ? [] : listPathSuggestions(deferredToken, process.cwd());
  const suggestions = commandMatches.length
    ? commandMatches
    : pathMatches.map((path) => ({ name: path, description: "attach file" }));
  const showAuto = suggestions.length > 0;
  const commandMode = commandMatches.length > 0;

  useEffect(() => setAutoSelected(0), [input]);

  useEffect(() => {
    if (!busy && !saActive) return;
    const id = setInterval(() => setBlink((value) => value + 1), 120);
    return () => clearInterval(id);
  }, [busy, saActive]);

  const firstPrompt = completed.find((message) => message.role === "user")?.content;
  useEffect(() => {
    setTerminalTitle(sessionTitle(firstPrompt));
  }, [firstPrompt]);

  const launched = useRef(false);
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    if (initialPrompt?.trim()) void submit(initialPrompt.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput((character, key) => {
    if (selection !== null || dragRef.current !== null) {
      setSelection(null);
      dragRef.current = null;
    }
    if (key.ctrl && character?.toLowerCase() === "c") {
      exit({ sessionId: session.id, createdAt: session.createdAt });
      return;
    }
    if (confirmRequest) {
      const allowed = character?.toLowerCase() === "y";
      const request = currentConfirmRef.current;
      currentConfirmRef.current = null;
      setConfirmRequest(null);
      drainConfirmQueue();
      request?.resolve(allowed);
      return;
    }
    if (ab) {
      if (key.escape) {
        setAb(null);
        flashNote("A/B discarded");
        return;
      }
      const ch = character?.toLowerCase();
      if (ch === "1" || ch === "a") { resolveAb("a"); return; }
      if (ch === "2" || ch === "b") { resolveAb("b"); return; }
      return;
    }
    if (overlay === "usage" && key.escape) {
      closeOverlay();
      return;
    }
    if (overlay) return;
    if (key.escape && subRunningRef.current > 0) {
      cancelSubagents();
      return;
    }
    if (key.pageUp) {
      scrolledRef.current = true;
      wheelUp();
      return;
    }
    if (key.pageDown) {
      wheelDown();
      return;
    }
    if (key.home) {
      scrolledRef.current = true;
      setScrollOffset(Number.MAX_SAFE_INTEGER);
      return;
    }
    if (key.end || key.escape && !busy) {
      setScrollOffset(0);
      return;
    }
    if (busy) {
      if (key.escape) {
        if (asides.some((entry) => entry.pending)) {
          asideAbortRef.current?.abort();
          setAsides((prev) => prev.filter((entry) => !entry.pending));
          escArmRef.current = null;
          flashNote("✓ Side question cancelled");
          return;
        }
        const now = Date.now();
        if (escAction(escArmRef.current, now) === "abort") {
          escArmRef.current = null;
          abortRef.current?.abort();
          return;
        }
        escArmRef.current = now + DOUBLE_ESC_MS;
        flashNote("⚠ tap esc again to interrupt", DOUBLE_ESC_MS + 500);
        return;
      }
      if (key.return) {
        const content = input.trim();
        if (/^\/btw\b/i.test(content)) {
          void fireAside(content.replace(/^\/btw\b\s*/i, ""));
          return;
        }
        if (content) {
          queueRef.current.push(content);
          setQueued(queueRef.current.length);
          write("", 0);
        }
        return;
      }
      // editing keys (typing, backspace, arrows, history) fall through below
    }
    if (key.escape || key.tab && !showAuto) return;
    if (key.return) {
      run(commandMode && showAuto ? suggestions[Math.min(autoSelected, suggestions.length - 1)].name : input);
      return;
    }
    if (key.tab && showAuto) {
      const picked = suggestions[Math.min(autoSelected, suggestions.length - 1)].name;
      if (commandMode) {
        write(picked + " ", picked.length + 1);
      } else {
        const head = pathToken === null ? input : input.slice(0, input.length - pathToken.length - 1);
        const next = `${head}@${picked}${picked.endsWith("/") ? "" : " "}`;
        write(next, next.length);
      }
      return;
    }
    if (key.leftArrow) {
      const position = Math.max(0, cursorRef.current - 1);
      if (position !== cursorRef.current) write(inputRef.current, position);
      return;
    }
    if (key.rightArrow) {
      const position = Math.min(inputRef.current.length, cursorRef.current + 1);
      if (position !== cursorRef.current) write(inputRef.current, position);
      return;
    }
    if (key.upArrow) {
      if (showAuto) return setAutoSelected(Math.max(0, autoSelected - 1));
      applyHistory(-1);
      return;
    }
    if (key.downArrow) {
      if (showAuto) return setAutoSelected(Math.min(suggestions.length - 1, autoSelected + 1));
      applyHistory(1);
      return;
    }
    if (key.backspace || key.delete) {
      const position = cursorRef.current;
      if (position === 0) return;
      const value = inputRef.current;
      write(value.slice(0, position - 1) + value.slice(position), position - 1);
      return;
    }
    if (key.ctrl || key.meta || !character) return;
    const clean = character.replace(/[\x00-\x1f\x7f]/g, "");
    const hasBreak = /[\r\n]/.test(character);
    if (clean) {
      const value = inputRef.current;
      const position = cursorRef.current;
      write(value.slice(0, position) + clean + value.slice(position), position + clean.length);
    }
    if (hasBreak) run(inputRef.current + clean);
  });

  function applyHistory(direction: -1 | 1) {
    const next = cycleHistory(sent, historyIndex, direction);
    write(next.draft, next.draft.length);
    setHistoryIndex(next.index);
  }

  function rememberMessage(content: string): void {
    setSent((previous) => [...previous, content]);
    setHistoryIndex(null);
  }

  /** Effective config for a streamed round — applies the per-turn fallback or route override if one is active. */
  function modelConfig(model: string): Config {
    const fb = fallbackRef.current;
    if (fb) return { ...activeConfig, ...fb.config, defaultModel: model };
    const route = routeRef.current;
    if (route) return { ...activeConfig, ...route.config, defaultModel: model };
    return { ...activeConfig, defaultModel: model };
  }

  /** Resolve a route's `model` (ID or `profile:<name>`) to a usable config + label. */
  function resolveRoute(model: string): { config: Config; model: string; label: string } | null {
    const trimmed = model.trim();
    if (trimmed.startsWith("profile:")) {
      const profile = activeConfig.profiles?.[trimmed.slice("profile:".length)];
      if (!profile) return null;
      return { config: { ...profile }, model: profile.defaultModel, label: `${profile.defaultModel} (profile:${trimmed.slice("profile:".length)})` };
    }
    return {
      config: { provider: activeConfig.provider, apiKey: activeConfig.apiKey, baseUrl: activeConfig.baseUrl, defaultModel: trimmed },
      model: trimmed,
      label: trimmed,
    };
  }

  /** Next usable fallback entry from config.fallbackModels, starting at fromIndex. */
  function nextFallback(fromIndex: number, baseModel: string): { config: Config; label: string; index: number } | null {
    const entries = activeConfig.fallbackModels ?? [];
    const skip = fallbackRef.current?.config.defaultModel ?? baseModel;
    for (let index = fromIndex; index < entries.length; index++) {
      const entry = entries[index].trim();
      if (!entry || entry === skip) continue;
      if (entry.toLowerCase().startsWith("profile:")) {
        const name = entry.slice("profile:".length);
        const profile = activeConfig.profiles?.[name];
        if (!profile) continue;
        return { config: { ...profile }, label: `${profile.defaultModel} (profile:${name})`, index };
      }
      return {
        config: {
          provider: activeConfig.provider,
          apiKey: activeConfig.apiKey,
          baseUrl: activeConfig.baseUrl,
          defaultModel: entry,
        },
        label: entry,
        index,
      };
    }
    return null;
  }

  async function submit(explicit?: string, forceAttachments?: string[]): Promise<void> {
    const content = (explicit ?? input).trim();
    if (!content) return;
    mainTurnRef.current = true;
    write("", 0);
    setError("");
    setScrollOffset(0);
    scrolledRef.current = false;
    rememberMessage(content);
    const found = forceAttachments?.length
      ? { texts: forceAttachments, images: [] as string[] }
      : extractAttachments(content, process.cwd());
    await send([
      ...sessionRef.current.messages,
      {
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        ...(found.texts.length ? { attachments: found.texts } : {}),
        ...(found.images.length ? { images: found.images } : {}),
      },
    ]);
  }

  /** "/btw" — instant side question; the answer never joins the conversation. */
  async function fireAside(question: string): Promise<void> {
    const q = question.trim();
    if (!q) {
      setError("Usage: /btw <question> — quick side answer, not added to the chat.");
      return;
    }
    write("", 0);
    const id = ++asideSeqRef.current;
    setAsides((prev) => [...prev, { id, q, a: "", pending: true }]);
    const controller = new AbortController();
    asideAbortRef.current = controller;
    try {
      const answer = await completeChat(
        { ...activeConfig, defaultModel: sessionRef.current.model },
        [
          {
            role: "system",
            timestamp: new Date().toISOString(),
            content:
              systemPrompt(process.cwd()) +
              '\n\nYou are answering a quick side question prefixed "btw:". Reply in one or two plain sentences. It is an aside, not a task: never use tools and never take action.',
          },
          ...sessionRef.current.messages,
          { role: "user", content: `btw: ${q}`, timestamp: new Date().toISOString() },
        ],
        { signal: controller.signal },
      );
      setAsides((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, a: answer, pending: false } : entry)),
      );
    } catch (cause) {
      setAsides((prev) => prev.filter((entry) => entry.id !== id));
      if (!isAbortError(cause)) setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  /** Resolve a pending A/B comparison: keep one answer, discard the other. */
  function resolveAb(side: "a" | "b"): void {
    const entry = ab;
    if (!entry) return;
    const answer = side === "a" ? entry.a : entry.b;
    if (!answer) {
      flashNote(`Still waiting on ${side.toUpperCase()}…`);
      return;
    }
    const userMsg: Message = {
      role: "user",
      content: entry.q,
      timestamp: new Date().toISOString(),
      ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
      ...(entry.images?.length ? { images: entry.images } : {}),
    };
    const replyMsg: Message = {
      role: "assistant",
      content: answer,
      timestamp: new Date().toISOString(),
    };
    const messages = [...sessionRef.current.messages, userMsg, replyMsg];
    let next: Session = { ...sessionRef.current, messages, updatedAt: new Date().toISOString() };
    if (!next.title) {
      const title = deriveSessionTitle(entry.q);
      if (title) next.title = title;
    }
    saveSession(next);
    sessionRef.current = next;
    setCompleted(messages);
    setSession(next);
    setAb(null);
    flashNote(`✓ Kept ${side.toUpperCase()} · ${side === "a" ? entry.modelA : entry.modelB}`);
  }

  /** Kick off parallel A/B comparison once model B is chosen. */
  function startCompare(question: string, modelB: string): void {
    const q = question.trim();
    if (!q) return;
    write("", 0);
    rememberMessage(q);
    const { texts: textParts, images: imageParts } = extractAttachments(q, process.cwd());
    const id = ++abSeqRef.current;
    const convoSnapshot = [...sessionRef.current.messages];
    const userMsg: Message = {
      role: "user",
      content: q,
      timestamp: new Date().toISOString(),
      ...(textParts.length ? { attachments: textParts } : {}),
      ...(imageParts.length ? { images: imageParts } : {}),
    };
    const system: Message = {
      role: "system",
      timestamp: new Date().toISOString(),
      content: activeConfig.systemPrompt?.trim() ? activeConfig.systemPrompt : systemPrompt(process.cwd()),
    };
    const payload: Message[] = [system, ...convoSnapshot, userMsg];
    const modelA = sessionRef.current.model;
    setAb({ id, q, modelA, modelB, attachments: textParts.length ? textParts : undefined, images: imageParts.length ? imageParts : undefined });
    const runSide = async (key: "a" | "b", model: string) => {
      const t0 = Date.now();
      try {
        const answer = await completeChat(
          { ...activeConfig, defaultModel: model },
          payload,
        );
        setAb((prev) => (prev?.id === id ? { ...prev, [key]: answer, [`${key}Ms`]: Date.now() - t0 } : prev));
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : String(cause);
        setAb((prev) => (prev?.id === id ? { ...prev, [key]: `(error) ${msg}`, [`${key}Ms`]: Date.now() - t0 } : prev));
      }
    };
    void Promise.allSettled([runSide("a", modelA), runSide("b", modelB)]);
  }

  async function send(input: Message[]): Promise<void> {
    const startedAt = Date.now();
    mainTurnRef.current = true;
    turnStartRef.current = startedAt;
    routeRef.current = null;
    const lastUser = [...input].reverse().find((message) => message.role === "user");
    const routed = matchRoutes(lastUser?.content ?? "", activeConfig.routes);
    if (routed) {
      const resolved = resolveRoute(routed.rule.model);
      if (resolved) {
        routeRef.current = resolved;
        flashNote(`⤳ routed → ${resolved.label}`);
      }
    }
    let messages = input;
    if (estimateTokens(messages) > tokenLimit(activeConfig)) {
      setStreaming("");
      const result = await compactMessages({ ...activeConfig, defaultModel: sessionRef.current.model }, messages);
      setStreaming(null);
      if (result) {
        messages = result.messages;
        flashNote(`✓ Compacted ${result.removed} older message(s)`);
      }
    }
    const base: Session = { ...sessionRef.current, messages };
    if (!base.title) {
      const title = deriveSessionTitle(messages.find((message) => message.role === "user" && !message.content.startsWith("["))?.content);
      if (title) base.title = title;
    }
    sessionRef.current = base;
    setCompleted(messages);
    setSession(base);
    setError("");
    setTokens(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const mutations: FileMutation[] = [];
    const toolCtx: ToolContext = {
      cwd: process.cwd(),
      confirm: enqueueConfirm,
      recordMutation: (mutation) => mutations.push(mutation),
      setPlan: (items) => {
        setPlan(items);
        const withPlan = { ...sessionRef.current, plan: items };
        saveSession(withPlan);
        sessionRef.current = withPlan;
      },
    };
    let convo = [...messages];
    let failure = "";
    let usage: Usage | undefined;
    const roundTokens = { prompt: 0, completion: 0 };
    let settled = false;

    try {
      let round = 0;
      while (round < MAX_ROUNDS && !controller.signal.aborted) {
        let calls: ToolCall[] | undefined;
        try {
          calls = await streamRound(fallbackRef.current?.config.defaultModel ?? routeRef.current?.model ?? base.model, convo, controller, (value) => {
            usage = value;
            roundTokens.prompt += value.prompt_tokens ?? 0;
            roundTokens.completion += value.completion_tokens ?? 0;
          });
        } catch (cause) {
          if (
            !controller.signal.aborted &&
            isRetryableError(cause) &&
            (fallbackRef.current !== null || (activeConfig.fallbackModels?.length ?? 0) > 0)
          ) {
            const next = fallbackRef.current
              ? nextFallback(fallbackRef.current.index + 1, base.model)
              : nextFallback(0, base.model);
            if (next) {
              fallbackRef.current = next;
              flashNote(`⇶ falling back to ${next.label}`);
              continue;
            }
          }
          throw cause;
        }
        round += 1;
        if (!bufferRef.current && !calls?.length && !controller.signal.aborted) {
          settled = true;
          break;
        }
        const reply: Message = {
          role: "assistant",
          content: bufferRef.current,
          timestamp: new Date().toISOString(),
          ...(calls?.length ? { toolCalls: calls } : {}),
        };
        convo = [...convo, reply];
        bufferRef.current = "";
        setCompleted(convo);
        setStreaming("");
        if (!calls?.length || controller.signal.aborted) {
          settled = true;
          break;
        }

        for (const call of calls) {
          const output = await executeTool({ name: call.name, args: call.args }, toolCtx);
          convo = [
            ...convo,
            {
              role: "tool",
              content: output.length > MAX_TOOL_OUTPUT ? `${output.slice(0, MAX_TOOL_OUTPUT)}\n… truncated` : output,
              timestamp: new Date().toISOString(),
              toolCallId: call.id,
            },
          ];
          setCompleted(convo);
        }
        setSession((previous) => ({ ...previous, messages: convo }));
      }
      if (!settled && !controller.signal.aborted) {
        failure = `Stopped after ${MAX_ROUNDS} tool rounds.`;
      }
    } catch (cause) {
      if (!isAbortError(cause)) failure = cause instanceof Error ? cause.message : String(cause);
    } finally {
      abortRef.current = null;
    }
    fallbackRef.current = null;
    routeRef.current = null;

    const hadTokens = roundTokens.prompt > 0 || roundTokens.completion > 0;
    const replyCost = hadTokens ? await costFor(base.model, roundTokens) : null;
    const finalSession: Session = {
      ...base,
      messages: convo,
      updatedAt: new Date().toISOString(),
      plan,
      ...(hadTokens
        ? {
            usage: addUsage(base.usage ?? emptyUsage(), {
              requests: 1,
              promptTokens: roundTokens.prompt,
              completionTokens: roundTokens.completion,
              costUsd: replyCost ?? 0,
            }),
          }
        : {}),
    };
    saveSession(finalSession);
    setCompleted(convo);
    setSession(finalSession);
    sessionRef.current = finalSession;
    try {
      const lastUser = [...convo].reverse().find((message) => message.role === "user");
      const firstLine = (lastUser?.content ?? "turn").split("\n")[0];
      createSnapshot(process.cwd(), firstLine.slice(0, 50) || "turn");
    } catch {
      // checkpoints are best-effort; never disturb the chat
    }
    if (!scrolledRef.current) setScrollOffset(0);
    setTokens(usage?.completion_tokens != null ? usage.completion_tokens : null);
    if (replyCost !== null) setCost(replyCost);
    const limit = activeConfig.spendLimitUsd;
    if (limit != null && replyCost != null && (finalSession.usage?.costUsd ?? 0) >= limit && (base.usage?.costUsd ?? 0) < limit) {
      flashNote(`⚠ Session spend crossed $${limit.toFixed(2)}`);
    }
    bufferRef.current = "";
    turnStartRef.current = null;
    setStreaming(null);
    if (!controller.signal.aborted && Date.now() - startedAt > 3000) {
      notifyTurnDone(!failure, firstWords(convo));
      if (!failure) flashNote("✓ Reply ready");
    }
    setError(failure);
    lastTurnMutationsRef.current = mutations;
    mainTurnRef.current = false;
    maybeFoldSubagents();
    const next = queueRef.current.shift();
    setQueued(queueRef.current.length);
    if (next) void submit(next);
  }

  async function streamRound(
    model: string,
    convo: Message[],
    controller: AbortController,
    onUsage: (value: Usage) => void,
  ): Promise<ToolCall[] | undefined> {
    bufferRef.current = "";
    setStreaming("");
    let received: ToolCall[] | undefined;
    const flush = setInterval(() => setStreaming(bufferRef.current), 50);
    try {
      const payload: Message[] = [
        {
          role: "system",
          content: activeConfig.systemPrompt?.trim() ? activeConfig.systemPrompt : systemPrompt(process.cwd()),
          timestamp: new Date().toISOString(),
        },
        ...convo.map((message) => {
          if (message.role !== "user") return message;
          if (!message.attachments?.length && !message.images?.length) return message;
          const built = buildVisionContent(message, process.cwd());
          return {
            ...message,
            contentParts: typeof built === "string" ? [{ type: "text" as const, text: built }] : built,
          };
        }),
      ];
      for await (const token of streamChat(modelConfig(model), payload, {
        signal: controller.signal,
        tools: toolSchemas(),
        onUsage,
        onStatus: (message) => flashNote(message),
        onToolCalls: (calls) => {
          received = calls;
        },
      })) {
        bufferRef.current += token;
      }
    } catch (cause) {
      if (!isAbortError(cause)) throw cause;
    } finally {
      clearInterval(flush);
    }
    return received;
  }

  /** "/subagent" — launch parallel background mini-agents (tasks split on "|"). */
  function startSubagents(tasks: string[]): void {
    write("", 0);
    rememberMessage(`/subagent ${tasks.join(" | ")}`);
    const id = ++subSeqRef.current;
    const controller = new AbortController();
    subAbortRef.current = controller;
    const model = sessionRef.current.model;
    const startIndex = sessionRef.current.messages.length;
    saMetaRef.current.set(id, { model, tasks, startIndex });
    pendingCountRef.current.set(id, tasks.length);
    const units: SaUnit[] = tasks.map((task, index) => ({
      key: `${id}-${index}`,
      task,
      status: "running",
      live: "…",
    }));
    setSubagents((previous) => [...previous, { id, model, startIndex, units }]);
    subRunningRef.current += tasks.length;
    for (const unit of units) void runSaUnit(id, unit.key, unit.task, controller, model);
    flashNote(`⟳ ${tasks.length} subagent${tasks.length === 1 ? "" : "s"} started — esc cancels`);
  }

  /** Run one self-contained subagent loop: private buffer, own abort, shared confirm queue. */
  async function runSaUnit(
    batchId: number,
    unitKey: string,
    task: string,
    controller: AbortController,
    model: string,
  ): Promise<void> {
    const t0 = Date.now();
    const convo: Message[] = [{ role: "user", content: task, timestamp: new Date().toISOString() }];
    const buffer: string[] = [];
    const tokensRound = { prompt: 0, completion: 0 };
    const mutations: FileMutation[] = [];
    const toolCtx: ToolContext = {
      cwd: process.cwd(),
      confirm: enqueueConfirm,
      recordMutation: (mutation) => mutations.push(mutation),
      setPlan: () => {},
    };
    const flush = setInterval(() => {
      const tail = buffer[buffer.length - 1];
      if (!tail) return;
      setSubagents((previous) =>
        previous.map((batch) =>
          batch.id === batchId
            ? { ...batch, units: batch.units.map((unit) => (unit.key === unitKey ? { ...unit, live: tail } : unit)) }
            : batch,
        ),
      );
    }, SUBAGENT_CHIP_REFRESH_MS);

    let status: SaUnit["status"] = "done";
    let result = "";
    try {
      for (let round = 0; round < SUBAGENT_MAX_ROUNDS && !controller.signal.aborted; round++) {
        const payload: Message[] = [
          { role: "system", content: SUBAGENT_PROMPT, timestamp: new Date().toISOString() },
          ...convo,
        ];
        let received: ToolCall[] | undefined;
        try {
          for await (const token of streamChat({ ...activeConfig, defaultModel: model }, payload, {
            signal: controller.signal,
            tools: toolSchemas(),
            onUsage: (value) => {
              tokensRound.prompt += value.prompt_tokens ?? 0;
              tokensRound.completion += value.completion_tokens ?? 0;
            },
            onStatus: () => {},
            onToolCalls: (calls) => {
              received = calls;
            },
          })) {
            if (!controller.signal.aborted) buffer.push(token);
          }
        } catch (cause) {
          if (!isAbortError(cause)) throw cause;
        }
        const text = buffer.join("");
        buffer.length = 0;
        if (!received?.length || controller.signal.aborted) {
          result = text;
          break;
        }
        convo.push({ role: "assistant", content: text, timestamp: new Date().toISOString(), toolCalls: received });
        for (const call of received) {
          let preview = "";
          try {
            const args = JSON.parse(call.args || "{}") as Record<string, unknown>;
            const first = Object.values(args)[0];
            if (typeof first === "string") preview = ` ${first.slice(0, 70)}`;
          } catch {
            // non-JSON args — no preview
          }
          const label = `⚙ ${call.name}${preview}`;
          setSubagents((previous) =>
            previous.map((batch) =>
              batch.id === batchId
                ? {
                    ...batch,
                    units: batch.units.map((unit) => (unit.key === unitKey ? { ...unit, live: label } : unit)),
                  }
                : batch,
            ),
          );
          const output = await executeTool({ name: call.name, args: call.args }, toolCtx);
          convo.push({
            role: "tool",
            content: output.length > MAX_TOOL_OUTPUT ? `${output.slice(0, MAX_TOOL_OUTPUT)}\n… truncated` : output,
            timestamp: new Date().toISOString(),
            toolCallId: call.id,
          });
        }
      }
      if (controller.signal.aborted) status = "cancelled";
      if (status === "done" && !result) result = "(no reply)";
    } catch (cause) {
      if (isAbortError(cause)) {
        status = "cancelled";
      } else {
        status = "error";
        result = `(error) ${cause instanceof Error ? cause.message : String(cause)}`;
      }
    } finally {
      clearInterval(flush);
    }

    const ms = Date.now() - t0;
    const hadTokens = tokensRound.prompt > 0 || tokensRound.completion > 0;
    const cost = hadTokens ? ((await costFor(model, tokensRound)) ?? 0) : 0;
    saResultsRef.current.set(unitKey, { status, result, ms, tokens: tokensRound, costUsd: cost });
    saMutationsRef.current.push(...mutations);
    setSubagents((previous) =>
      previous.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              units: batch.units.map((unit) => (unit.key === unitKey ? { ...unit, status, result, ms, live: "" } : unit)),
            }
          : batch,
      ),
    );
    subRunningRef.current = Math.max(0, subRunningRef.current - 1);
    const remaining = (pendingCountRef.current.get(batchId) ?? 1) - 1;
    pendingCountRef.current.set(batchId, remaining);
    if (remaining <= 0) onBatchDone(batchId);
  }

  /** All units in a batch finished — build the report and queue it for folding. */
  function onBatchDone(batchId: number): void {
    const meta = saMetaRef.current.get(batchId);
    subAbortRef.current = null;
    if (!meta) return;
    const lines = [`⟳ subagent report · ${meta.tasks.length} task${meta.tasks.length === 1 ? "" : "s"} · ${meta.model}`];
    let prompt = 0;
    let completion = 0;
    let cost = 0;
    let slowest = 0;
    meta.tasks.forEach((task, index) => {
      const res = saResultsRef.current.get(`${batchId}-${index}`);
      const mark = res?.status === "done" ? "✓" : res?.status === "cancelled" ? "−" : "✗";
      const suffix =
        res?.status === "done"
          ? ` · ${((res.ms ?? 0) / 1000).toFixed(1)}s`
          : res?.status === "cancelled"
            ? " · cancelled"
            : " · failed";
      lines.push(`  ${mark} [${index + 1}] ${task}${suffix}`);
      if (res) {
        lines.push(res.result.split("\n").map((line) => `      ${line}`).join("\n"));
        prompt += res.tokens.prompt;
        completion += res.tokens.completion;
        cost += res.costUsd;
        slowest = Math.max(slowest, res.ms ?? 0);
      }
    });
    lines.push(`  · batch done in ${(slowest / 1000).toFixed(1)}s · ~${Math.ceil((prompt + completion) / 1000)}k tokens`);
    pendingSaFoldRef.current.push({
      batchId,
      index: meta.startIndex,
      content: lines.join("\n"),
      tokens: { prompt, completion },
      costUsd: cost,
      mutations: saMutationsRef.current,
    });
    saMutationsRef.current = [];
    maybeFoldSubagents();
  }

  /** Fold finished subagent batches into the session, but never mid-turn. */
  function foldPendingSa(): void {
    const pending = pendingSaFoldRef.current;
    pendingSaFoldRef.current = [];
    let messages = sessionRef.current.messages;
    let usage = sessionRef.current.usage;
    for (const entry of pending.sort((a, b) => a.index - b.index)) {
      const block: Message = {
        role: "assistant",
        content: entry.content,
        timestamp: new Date().toISOString(),
        subagent: true,
      };
      const at = Math.min(entry.index, messages.length);
      messages = [...messages.slice(0, at), block, ...messages.slice(at)];
      usage = addUsage(usage ?? emptyUsage(), {
        requests: 1,
        promptTokens: entry.tokens.prompt,
        completionTokens: entry.tokens.completion,
        costUsd: entry.costUsd,
      });
      lastTurnMutationsRef.current.push(...entry.mutations);
      setSubagents((previous) => previous.filter((batch) => batch.id !== entry.batchId));
    }
    const next: Session = { ...sessionRef.current, messages, updatedAt: new Date().toISOString(), usage };
    saveSession(next);
    setSession(next);
    sessionRef.current = next;
    setCompleted(messages);
    flashNote(`✓ ${pending.length} subagent report${pending.length === 1 ? "" : "s"} folded into the chat`);
  }

  /** Fold pending reports when the main agent isn't mid-turn. */
  function maybeFoldSubagents(): void {
    if (mainTurnRef.current || pendingSaFoldRef.current.length === 0) return;
    foldPendingSa();
  }

  /** A single esc cancels every running subagent. */
  function cancelSubagents(): void {
    subAbortRef.current?.abort();
    if (subRunningRef.current === 0) return;
    flashNote(`⟳ cancelling ${subRunningRef.current} subagent${subRunningRef.current === 1 ? "" : "s"}…`);
    escArmRef.current = null;
  }

  function openOverlay(kind: Exclude<OverlayKind, null>): void {
    setOverlay(kind);
  }

  function closeOverlay(): void {
    setOverlay(null);
  }

  function switchModel(id: string): void {
    const next: Session = { ...session, model: id };
    saveSession(next);
    setSession(next);
    setTokens(null);
    setCost(null);
    setError("");
  }

  function resume(id: string): void {
    try {
      const loaded = loadSession(id);
      setSession(loaded);
      setCompleted(loaded.messages);
      setPlan(loaded.plan ?? []);
      setAsides([]);
      setTokens(null);
      setCost(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function startNewChat(): void {
    const fresh = createSession(session.model);
    setSession(fresh);
    setCompleted([]);
    setPlan([]);
    setAsides([]);
    setTokens(null);
    setCost(null);
    setError("");
  }

  function logout(): void {
    const removed = removeConfig();
    exit(removed ? "All BajajBot data removed. Run `bajajbot` to set up again." : "Nothing to remove.");
  }

  async function generateCommitMessage(previous?: CommitMessage): Promise<void> {
    const cwd = process.cwd();
    const diff = diffForContext(cwd);
    const summary = filesSummary(cwd);
    const hint = previous ? `The user rejected the previous suggestion "${previous.subject}" — write a fresh one that does not repeat its phrasing.` : "";
    const messages: Message[] = [
      {
        role: "system",
        content:
          "You write short conventional git commit messages (feat/fix/docs/refactor/chore/style/perf/test/build/ci/revert). " +
          "Reply with ONLY the commit message: one subject line at most 72 chars (imperative mood, no trailing period), then a blank line, then up to 5 bullet points starting with a dash that summarise the concrete changes. No preamble, no markdown fences, no line-wrapping.",
        timestamp: new Date().toISOString(),
      },
      {
        role: "user",
        content: `${hint}\n\nChanges to commit (${summary}):\n\n${diff || "(no readable diff)\nList the files below:\n" + (worktreeChanges(cwd) ?? []).map((entry) => `${entry.status} ${entry.path}`).join("\n")}`,
        timestamp: new Date().toISOString(),
      },
    ];
    const reply = await completeChat(modelConfig(session.model), messages);
    setCommitDialog((prev) =>
      prev ? { ...prev, message: parseCommitMessage(reply), busy: false } : prev,
    );
  }

  function runCommit(): void {
    const cwd = process.cwd();
    const files = worktreeChanges(cwd);
    if (files === null) {
      flashNote("commit aborted — not a git repository — run: git init");
      return;
    }
    if (files.length === 0) {
      flashNote("nothing to commit — working tree is clean");
      return;
    }
    if (!gitUserConfigured(cwd)) {
      flashNote('git user.name / user.email unset — run: git config user.name "You" && git config user.email you@example.com');
      return;
    }
    setOverlay("commit");
    setCommitDialog({ files, busy: true, message: { subject: "…", body: [] } });
    void generateCommitMessage().catch((cause: unknown) => {
      setCommitDialog(null);
      setOverlay(null);
      flashNote(`could not write a commit message: ${cause instanceof Error ? cause.message : String(cause)}`);
    });
  }

  function doCommit(message: CommitMessage): void {
    try {
      const sha = commitTree(process.cwd(), message);
      setCommitDialog(null);
      setOverlay(null);
      flashNote(`✓ committed — ${sha} ${message.subject}`);
    } catch (cause) {
      flashNote(`commit failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  function applyCommitSubject(subject: string): void {
    setCommitDialog((prev) => (prev ? { ...prev, message: { ...prev.message, subject } } : prev));
  }

  function run(raw: string): void {
    const trimmed = raw.trim();
    const matched = matchCommand(trimmed);
    if (!matched) {
      void submit(trimmed);
      return;
    }
    write("", 0);
    switch (matched.command.name) {
      case "/help":
        openOverlay("help");
        break;
      case "/usage":
        openOverlay("usage");
        break;
      case "/skills":
        openOverlay("skills");
        break;
      case "/checkpoints":
        openOverlay("checkpoints");
        break;
      case "/changes":
        openOverlay("changes");
        break;
      case "/commit":
        runCommit();
        break;
      case "/ollama":
        runOllama();
        break;
      case "/theme":
        openOverlay("theme");
        break;
      case "/memory":
        openOverlay("memory");
        break;
      case "/model":
        if (matched.arg) switchModel(matched.arg);
        else openOverlay("model");
        break;
      case "/copy": {
        const last = [...completed].reverse().find((message) => message.role === "assistant" && message.content.trim());
        if (!last) {
          setError("Nothing to copy yet.");
          break;
        }
        copyToClipboard(last.content, stdoutRef.current ?? undefined);
        flashNote(`✓ Copied ${last.content.length} chars to clipboard`);
        break;
      }
      case "/retry": {
        const lastUser = [...session.messages].reverse().findIndex((message) => message.role === "user");
        if (lastUser === -1) {
          setError("Nothing to retry yet.");
          break;
        }
        void send(session.messages.slice(0, session.messages.length - lastUser));
        break;
      }
      case "/undo": {
        const lastUser = [...session.messages].reverse().findIndex((message) => message.role === "user");
        if (lastUser === -1) {
          setError("Nothing to undo.");
          break;
        }
        const truncated = session.messages.slice(0, session.messages.length - lastUser - 1);
        const next = { ...session, messages: truncated, updatedAt: new Date().toISOString() };
        saveSession(next);
        setSession(next);
        setCompleted(truncated);
        setTokens(null);
        setError("");
        setScrollOffset(0);
        const { restored, skipped } = restoreMutations(lastTurnMutationsRef.current);
        lastTurnMutationsRef.current = [];
        flashNote(
          restored > 0 || skipped > 0
            ? `✓ Removed last exchange · reverted ${restored} file change(s)${skipped > 0 ? ` · ${skipped} not restorable` : ""}`
            : "✓ Removed last exchange",
        );
        break;
      }
      case "/export": {
        if (completed.length === 0) {
          setError("Nothing to export yet.");
          break;
        }
        const json = matched.arg.trim().toLowerCase() === "json";
        const filePath = resolve(process.cwd(), `bajajbot-${session.id}.${json ? "json" : "md"}`);
        const body = json
          ? JSON.stringify({ model: session.model, createdAt: session.createdAt, messages: completed }, null, 2)
          : toMarkdown(session.model, completed);
        try {
          writeFileSync(filePath, `${body}\n`, "utf8");
          flashNote(`✓ Exported to ${filePath}`);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
        break;
      }
      case "/search": {
        const query = matched.arg.trim();
        if (!query) {
          setError("Usage: /search <text>");
          break;
        }
        const needle = query.toLowerCase();
        const matches: SearchMatch[] = [];
        completed.forEach((message, messageIndex) => {
          const haystack = message.content.toLowerCase();
          let from = 0;
          while (matches.length < 50) {
            const at = haystack.indexOf(needle, from);
            if (at === -1) break;
            const start = Math.max(0, at - 30);
            const end = Math.min(message.content.length, at + query.length + 30);
            matches.push({
              messageIndex,
              role: message.role === "user" || message.role === "assistant" ? message.role : "tool",
              snippet: `${start > 0 ? "…" : ""}${message.content.slice(start, end).replace(/\s+/g, " ").trimEnd()}${end < message.content.length ? "…" : ""}`,
            });
            from = at + Math.max(query.length, 1);
          }
        });
        if (matches.length === 0) {
          flashNote(`No matches for "${query}"`);
          break;
        }
        setSearch({ query, matches });
        openOverlay("search");
        break;
      }
      case "/btw":
        void fireAside(trimmed.replace(/^\/btw\b\s*/i, ""));
        break;
      case "/fallback": {
        const rest = trimmed.replace(/^\/fallback\b\s*/i, "").trim();
        if (/^clear$/i.test(rest)) {
          const cleared = { ...activeConfig, fallbackModels: [] };
          saveConfig(cleared);
          setActiveConfig(cleared);
          flashNote("⇶ fallback chain cleared");
          break;
        }
        if (rest) {
          const added = { ...activeConfig, fallbackModels: [...(activeConfig.fallbackModels ?? []), rest] };
          saveConfig(added);
          setActiveConfig(added);
          flashNote(`⇶ fallback added: ${rest}`);
          break;
        }
        openOverlay("fallback");
        break;
      }
      case "/route": {
        const rest = trimmed.replace(/^\/route\b\s*/i, "").trim();
        if (/^clear$/i.test(rest)) {
          const cleared = { ...activeConfig, routes: [] };
          saveConfig(cleared);
          setActiveConfig(cleared);
          flashNote("⤳ routes cleared");
          break;
        }
        const add = rest.match(/^add\s+(?:"([^"]+)"|(\S+))\s+(\S+)$/);
        if (add) {
          const pattern = add[1] ?? add[2] ?? "";
          const model = add[3] ?? "";
          const next = { ...activeConfig, routes: [...(activeConfig.routes ?? []), { pattern, model, active: true }] };
          saveConfig(next);
          setActiveConfig(next);
          flashNote(`⤳ route added: ${pattern} → ${model}`);
          break;
        }
        openOverlay("route");
        break;
      }
      case "/todo": {
        const rest = trimmed.replace(/^\/todo\b\s*/i, "").trim();
        const persistTodos = (next: TodoItem[]): void => {
          saveTodos(process.cwd(), next);
          setTodos(next);
        };
        if (/^clear$/i.test(rest)) {
          persistTodos([]);
          flashNote("✓ todos cleared");
          break;
        }
        const add = rest.match(/^add\s+([\s\S]+)$/);
        if (add) {
          persistTodos([...loadTodos(process.cwd()), { text: (add[1] ?? "").replace(/\\n/g, "\n").trim().slice(0, 300), done: false }]);
          flashNote(`✓ todo added: "${add[1]}"`);
          break;
        }
        setTodos(loadTodos(process.cwd()));
        openOverlay("todo");
        break;
      }
      case "/sn": {
        const rest = trimmed.replace(/^\/sn\b\s*/i, "").trim();
        const snippetArg = matched.arg?.trim();
        const updateSnippets = (next: Snippet[]): void => {
          const nextConfig = { ...activeConfig, snippets: next };
          saveConfig(nextConfig);
          setActiveConfig(nextConfig);
        };
        if (/^clear$/i.test(rest)) {
          updateSnippets([]);
          flashNote("✓ snippets cleared");
          break;
        }
        const rm = rest.match(/^rm\s+(\S+)$/);
        if (rm) {
          const target = normalizeSnippetName(rm[1] ?? "");
          const next = (activeConfig.snippets ?? []).filter((entry) => normalizeSnippetName(entry.name) !== target);
          updateSnippets(next);
          flashNote(next.length === (activeConfig.snippets ?? []).length ? `no snippet named "${rm[1]}"` : `✗ removed "${rm[1]}"`);
          break;
        }
        const add = rest.match(/^add\s+(\S+)\s+([\s\S]+)$/);
        if (add) {
          const next = [...(activeConfig.snippets ?? []), { name: normalizeSnippetName(add[1] ?? ""), text: expandSnippetText(add[2] ?? "") }];
          updateSnippets(next);
          flashNote(`✓ snippet "${add[1]}" saved`);
          break;
        }
        const save = rest.match(/^save\s+(\S+)$/);
        if (save) {
          const lastPrompt = sent[sent.length - 1];
          if (!lastPrompt || lastPrompt.startsWith("/")) {
            flashNote("nothing to save yet — send a prompt first, then /sn save <name>");
            break;
          }
          const next = [...(activeConfig.snippets ?? []), { name: normalizeSnippetName(save[1] ?? ""), text: lastPrompt }];
          updateSnippets(next);
          flashNote(`✓ saved last prompt as "${save[1]}"`);
          break;
        }
        if (snippetArg) {
          const target = normalizeSnippetName(snippetArg);
          const snippet = (activeConfig.snippets ?? []).find((entry) => normalizeSnippetName(entry.name) === target);
          if (!snippet) {
            flashNote(`no snippet named "${snippetArg}" — type /sn to browse`);
            break;
          }
          write(snippet.text, 0);
          flashNote(`✓ "${snippet.name}" inserted into input`);
          break;
        }
        openOverlay("snippet");
        break;
      }
      case "/subagent": {
        if (subRunningRef.current > 0) {
          flashNote("⚠ subagents already running — wait or press esc");
          break;
        }
        const tasks = trimmed
          .replace(/^\/subagent\b\s*/i, "")
          .split(/\s*[|,]\s*|\n+/)
          .map((task) => task.trim())
          .filter(Boolean);
        if (tasks.length === 0) {
          setError("Usage: /subagent <task>, <task2> — any number of tasks, separated by commas, pipes, or new lines. Each runs as its own parallel agent.");
          break;
        }
        startSubagents(tasks);
        break;
      }
      case "/compare": {
        const question = trimmed.replace(/^\/compare\b\s*/i, "");
        if (!question) {
          setError("Usage: /compare <question> — picks a second model, compares answers.");
          break;
        }
        if (busy || ab) {
          flashNote("⚠ finish the current turn first");
          break;
        }
        pendingCompareRef.current = question;
        openOverlay("compareModel");
        break;
      }
      case "/sessions":
        openOverlay("sessions");
        break;
      case "/profile":
        if (Object.keys(activeConfig.profiles ?? {}).length === 0) {
          setError("No profiles saved. Use `bajajbot profile save <name>`.");
          break;
        }
        openOverlay("profile");
        break;
      case "/new":
        startNewChat();
        break;
      case "/logout":
        openOverlay("logout");
        break;
    }
  }

  function applyProfile(name?: string): void {
    closeOverlay();
    if (!name) return;
    const profile = activeConfig.profiles?.[name];
    if (!profile) return;
    const next: Config = { ...profile, profiles: activeConfig.profiles };
    saveConfig(next);
    setActiveConfig(next);
    setProfileName(name);
    pricingRef.current = null;
    switchModel(profile.defaultModel);
    flashNote(`✓ Profile "${name}" active`);
  }

  function runOllama(): void {
    flashNote(`probing Ollama at ${OLLAMA_URL}…`);
    void ollamaProbe()
      .then((found) => {
        if (!found) {
          flashNote(`no Ollama server answered at ${OLLAMA_URL} — is \`ollama serve\` running?`);
          return;
        }
        const merged = mergeOllamaProfiles(activeConfig.profiles ?? {}, found);
        const profile = merged.profiles[OLLAMA_PROFILE_NAME];
        if (!profile) return;
        saveConfig({ ...profile, profiles: merged.profiles });
        setActiveConfig({ ...profile, profiles: merged.profiles });
        setProfileName(OLLAMA_PROFILE_NAME);
        pricingRef.current = null;
        switchModel(merged.model);
        flashNote(
          `✓ Ollama: ${found.models.join(", ")} — ${merged.created ? "profile created" : "using profile"}, model ${merged.model}`,
        );
      })
      .catch((cause: unknown) =>
        flashNote(`ollama setup failed: ${cause instanceof Error ? cause.message : String(cause)} — is \`ollama serve\` running?`),
      )
  }

  const chat = useMemo(() => {
    const messages: Message[] =
      streaming !== null && streaming.length > 0
        ? [...completed, { role: "assistant", content: streaming, timestamp: new Date().toISOString() }]
        : completed;
    const lines = buildChatLines(messages, columns);
    asides.forEach((entry, asideIndex) => {
      const base = `a${entry.id}`;
      lines.push({
        key: `${base}q`,
        node: <Text dimColor>{`  btw · ${entry.q}`}</Text>,
        text: `  btw · ${entry.q}`,
        messageIndex: -1,
      });
      if (entry.pending) {
        lines.push({
          key: `${base}p`,
          node: <Text dimColor>{"  …thinking"}</Text>,
          text: "  …thinking",
          messageIndex: -1,
        });
      } else {
        wrapText(entry.a, Math.max(columns - 6, 16)).forEach((row, rowIndex) => {
          lines.push({
            key: `${base}r${rowIndex}`,
            node: (
              <Text dimColor>
                <Text italic>{row}</Text>
              </Text>
            ),
            text: row,
            messageIndex: -1,
          });
        });
      }
      if (asideIndex < asides.length - 1) {
        lines.push({ key: `${base}s`, node: <Text> </Text>, text: " ", messageIndex: -1 });
      }
    });
    if (ab) {
      const base = `ab${ab.id}`;
      const hasAnswer = (s: "a" | "b") => (s === "a" ? ab.a : ab.b) !== undefined;
      const elapsed = (ms?: number) => (ms != null ? ` · ${(ms / 1000).toFixed(1)}s` : "");
      const tok = (text?: string) => (text ? ` · ~${Math.ceil(text.length / 4)} tok` : "");
      const sideBlock = (s: "a" | "b") => {
        const model = s === "a" ? ab.modelA : ab.modelB;
        const answer = s === "a" ? ab.a : ab.b;
        const ms = s === "a" ? ab.msA : ab.msB;
        const pending = answer === undefined;
        const tag = pending ? "…thinking" : `${elapsed(ms)}${tok(answer ?? "")}`;
        const rows: ChatLine[] = [
          {
            key: `${base}${s}h`,
            node: <Text dimColor>{`  ${s.toUpperCase()} · ${model}${tag}`}</Text>,
            text: `  ${s.toUpperCase()} · ${model}${tag}`,
            messageIndex: -1,
          },
        ];
        if (!pending) {
          wrapText(answer!, Math.max(columns - 6, 16)).forEach((row, ri) => {
            rows.push({
              key: `${base}${s}r${ri}`,
              node: <Text>{row}</Text>,
              text: row,
              messageIndex: -1,
            });
          });
        }
        return rows;
      };
      lines.push({
        key: `${base}q`,
        node: <Text dimColor>{`  ⚡ A/B · ${ab.q}`}</Text>,
        text: `  ⚡ A/B · ${ab.q}`,
        messageIndex: -1,
      });
      lines.push(...sideBlock("a"), ...sideBlock("b"));
      const bothDone = hasAnswer("a") && hasAnswer("b");
      lines.push({
        key: `${base}hint`,
        node: (
          <Text dimColor>
            {bothDone
              ? "  [1] keep A · [2] keep B · esc discards"
              : "  …waiting for both answers"}
          </Text>
        ),
        text: bothDone ? "  [1] keep A · [2] keep B · esc discards" : "  …waiting",
        messageIndex: -1,
      });
      lines.push({ key: `${base}s`, node: <Text> </Text>, text: " ", messageIndex: -1 });
    }
    subagents.forEach((batch, batchIndex) => {
      const base = `sa${batch.id}`;
      const running = batch.units.some((unit) => unit.status === "running");
      const header = `  ⟳ subagents · ${batch.units.map((unit) => unit.task).join(" | ")}${running ? " · esc cancels" : ""}`;
      lines.push({ key: `${base}q`, node: <Text color={theme.accent}>{header}</Text>, text: header, messageIndex: -1 });
      batch.units.forEach((unit, unitIndex) => {
        const mark =
          unit.status === "running"
            ? SPINNER_FRAMES[blink % SPINNER_FRAMES.length]
            : unit.status === "done"
              ? "✓"
              : unit.status === "cancelled"
                ? "−"
                : "✗";
        const label =
          unit.status === "running"
            ? unit.live || "…"
            : unit.status === "done"
              ? `done · ${((unit.ms ?? 0) / 1000).toFixed(1)}s`
              : unit.status;
        const line = `  ${mark} [${unitIndex + 1}] ${unit.task} — ${label}`;
        lines.push({ key: `${base}u${unitIndex}`, node: <Text dimColor>{line}</Text>, text: line, messageIndex: -1 });
      });
      if (batchIndex < subagents.length - 1) {
        lines.push({ key: `${base}s`, node: <Text> </Text>, text: " ", messageIndex: -1 });
      }
    });
    return lines;
  }, [completed, columns, streaming, asides, ab, subagents]);
  const chatBudget = Math.max(
    rows -
      CHAT_RESERVED_ROWS -
      (confirmRequest ? CONFIRM_RESERVED_ROWS : 0) -
      (error ? ERROR_RESERVED_ROWS : 0) -
      (showAuto ? Math.min(suggestions.length, MAX_AUTOCOMPLETE_ROWS) : 0),
    MIN_CHAT_BUDGET,
  );
  const maxOffset = Math.max(0, chat.length - chatBudget);
  const offset = Math.min(scrollOffset, maxOffset);
  const visibleLines = chat.slice(
    Math.max(0, chat.length - offset - chatBudget),
    Math.max(0, chat.length - offset),
  );
  const showChatBody = !overlay && (!fresh || confirmRequest !== null);
  const busyElapsedSecs = turnStartRef.current != null ? (Date.now() - turnStartRef.current) / 1000 : 0;
  const ctxPercent = Math.min(100, (estimateTokens(completed) / tokenLimit(activeConfig)) * 100);
  const statusTip = error
    ? contextualTip({ errored: true })
    : ctxPercent >= 70
      ? contextualTip({ contextPercent: ctxPercent })
      : rotatingTip(completed.length);

  // Screen-row geometry of the chat viewport (bottom-anchored stack below it).
  const planRows = plan.length ? Math.min(plan.length, 5) + 1 : 0; // board + header
  const stackRows =
    (offset > 0 ? 1 : 0) +
    (confirmRequest ? Math.min(confirmRequest.detail.split("\n").length, 6) + 7 : 0) +
    (showAuto ? suggestions.length : 0) +
    (error ? 1 : 0) +
    (busy ? 1 : 0) +
    planRows +
    3 + // InputBox border box
    2; // StatusBar rule + row
  const chatTopRow = rows - visibleLines.length - stackRows;
  geomRef.current = { top: chatTopRow, count: visibleLines.length };
  textsRef.current = visibleLines.map((line) => line.text);
  uiRef.current = { selectable: showChatBody };

  let highlight: Record<number, Highlight> | undefined;
  if (selection && showChatBody) {
    const rect = normalizeRect(selection.ax, selection.ay, selection.bx, selection.by);
    const relTop = rect.top - chatTopRow;
    const relBottom = rect.bottom - chatTopRow;
    if (relBottom >= 0 && relTop < visibleLines.length) {
      highlight = {};
      for (
        let index = Math.max(0, relTop);
        index <= Math.min(visibleLines.length - 1, relBottom);
        index += 1
      ) {
        highlight[index] = {
          left: index === relTop ? rect.left : 0,
          right: index === relBottom ? rect.right : Number.MAX_SAFE_INTEGER,
          full: index !== relTop && index !== relBottom,
        };
      }
    }
  }

  const wheelUp = (): void => {
    scrolledRef.current = true;
    setScrollOffset((value) => value + SCROLL_STEP);
  };
  const wheelDown = (): void => setScrollOffset((value) => Math.max(0, value - SCROLL_STEP));

  return (
    <Box flexDirection="column">
      {fresh && !overlay && !confirmRequest ? (
        <Splash
          config={activeConfig}
          input={input}
          cursor={cursor}
          rows={rows}
          columns={columns}
          suggestions={suggestions}
          autoSelected={autoSelected}
        />
      ) : null}
      {overlay === "help" ? <HelpDialog onClose={closeOverlay} /> : null}
      {overlay === "usage" && usageTotals ? (
        <Overlay title="Usage">
          <UsagePanel totals={usageTotals} />
          <Text dimColor>esc close</Text>
        </Overlay>
      ) : null}
      {overlay === "skills" ? (
        <SkillPicker
          skills={skillList}
          onSelect={(name) => {
            closeOverlay();
            if (!name) return;
            const skill = skillList.find((entry) => entry.name === name);
            if (!skill) return;
            void submit(`Load and follow the "${skill.name}" skill exactly.`, [skill.path]);
          }}
        />
      ) : null}
      {overlay === "checkpoints" ? (
        <SnapshotPicker
          snapshots={listSnapshots(process.cwd())}
          onRestore={(sha) => {
            closeOverlay();
            if (restoreSnapshot(process.cwd(), sha)) flashNote("✓ Restored checkpoint");
            else setError("Checkpoint restore failed.");
          }}
          onClose={closeOverlay}
        />
      ) : null}
      {overlay === "changes" ? <ChangesOverlay files={changedFiles} onClose={closeOverlay} /> : null}
      {overlay === "commit" && commitDialog ? (
        <CommitDialog
          files={commitDialog.files}
          message={commitDialog.message}
          busy={commitDialog.busy}
          onCommit={() => doCommit(commitDialog.message)}
          onRegenerate={() => {
            if (commitDialog.busy) return;
            setCommitDialog({ ...commitDialog, busy: true });
            void generateCommitMessage(commitDialog.message).catch((cause: unknown) => {
              setCommitDialog(null);
              setOverlay(null);
              flashNote(`could not write a commit message: ${cause instanceof Error ? cause.message : String(cause)}`);
            });
          }}
          onApplySubject={applyCommitSubject}
          onClose={() => {
            setCommitDialog(null);
            closeOverlay();
            flashNote("commit cancelled");
          }}
        />
      ) : null}
      {overlay === "memory" ? <MemoryOverlay facts={memoryFacts} onClose={closeOverlay} /> : null}
      {overlay === "theme" ? (
        <ThemePicker
          onSelect={(name) => {
            closeOverlay();
            if (!name || name === activeConfig.theme) return;
            applyTheme(name);
            const next = { ...activeConfig, theme: name };
            saveConfig(next);
            setActiveConfig(next);
            flashNote(`✓ Theme "${name}"`);
          }}
        />
      ) : null}
      {overlay === "logout" ? <LogoutDialog onClose={closeOverlay} onConfirm={logout} /> : null}
      {overlay === "model" ? (
        <ModelPicker
          config={activeConfig}
          onSelect={(id) => { closeOverlay(); if (id) switchModel(id); }}
          onToggleFavorite={(id) => {
            const favorites = activeConfig.favoriteModels ?? [];
            const next = favorites.some((entry) => entry.toLowerCase() === id.toLowerCase())
              ? favorites.filter((entry) => entry.toLowerCase() !== id.toLowerCase())
              : [...favorites, id];
            const nextConfig = { ...activeConfig, favoriteModels: next };
            saveConfig(nextConfig);
            setActiveConfig(nextConfig);
          }}
          recentModels={recentModels}
        />
      ) : null}
      {overlay === "compareModel" ? (
        <ModelPicker
          config={activeConfig}
          title="Compare against…"
          onSelect={(id) => { closeOverlay(); if (id) startCompare(pendingCompareRef.current, id); }}
        />
      ) : null}
      {overlay === "profile" ? (
        <ProfilePicker profiles={activeConfig.profiles ?? {}} active={profileName} onSelect={applyProfile} />
      ) : null}
      {overlay === "fallback" ? (
        <FallbackPicker
          config={activeConfig}
          onUpsert={(next) => {
            const nextConfig = { ...activeConfig, fallbackModels: next };
            saveConfig(nextConfig);
            setActiveConfig(nextConfig);
            flashNote(`⇶ fallback chain (${next.length}): ${next.join(", ")}`);
          }}
          onClose={closeOverlay}
        />
      ) : null}
      {overlay === "route" ? (
        <RoutePicker
          config={activeConfig}
          onUpsert={(next) => {
            const nextConfig = { ...activeConfig, routes: next };
            saveConfig(nextConfig);
            setActiveConfig(nextConfig);
          }}
          onClose={closeOverlay}
        />
      ) : null}
      {overlay === "snippet" ? (
        <SnippetPicker
          snippets={activeConfig.snippets ?? []}
          onInsert={(snippet) => {
            write(snippet.text, 0);
            closeOverlay();
            flashNote(`✓ "${snippet.name}" inserted into input`);
          }}
          onUpsert={(next) => {
            const nextConfig = { ...activeConfig, snippets: next };
            saveConfig(nextConfig);
            setActiveConfig(nextConfig);
          }}
          onClose={closeOverlay}
        />
      ) : null}
      {overlay === "todo" ? (
        <TodoPicker
          items={todos}
          onUpsert={(next) => {
            saveTodos(process.cwd(), next);
            setTodos(next);
          }}
          onClose={closeOverlay}
        />
      ) : null}
      {overlay === "sessions" ? (
        <SessionPicker
          sessions={sessionRows}
          currentId={session.id}
          onSelect={(id) => {
            closeOverlay();
            if (id) resume(id);
          }}
        />
      ) : null}
      {overlay === "search" && search ? (
        <SearchDialog
          matches={search.matches}
          query={search.query}
          onClose={closeOverlay}
          onSelect={(match) => {
            closeOverlay();
            if (!match) return;
            const line = chat.findIndex((entry) => entry.messageIndex === match.messageIndex);
            if (line === -1) return;
            scrolledRef.current = true;
            setScrollOffset(Math.max(0, chat.length - chatBudget - line));
          }}
        />
      ) : null}
      {showChatBody ? (
        <Box height={rows} flexDirection="column" justifyContent="flex-end">
          <ChatViewport lines={visibleLines} highlight={highlight} width={columns} />
          {offset > 0 ? (
            <Text dimColor>{`  ↑ ${offset} more lines above · pgDn / end returns to latest`}</Text>
          ) : null}
          {confirmRequest ? (
            <Box marginBottom={1}>
              <Overlay title="Allow action?">
                <Text bold>{confirmRequest.title}</Text>
                <Text> </Text>
                {confirmRequest.detail.split("\n").slice(0, 6).map((line, index) => {
                  const added = line.startsWith("+ ");
                  const removed = line.startsWith("- ");
                  return (
                    <Text
                      key={`${index}-${line.slice(0, 8)}`}
                      color={added ? theme.success : removed ? theme.danger : undefined}
                      dimColor={!added && !removed}
                    >
                      {"  "}
                      {line.length > 100 ? `${line.slice(0, 100)}…` : line}
                    </Text>
                  );
                })}
                <Text> </Text>
                <Text dimColor>{"  "}y allow · n / esc deny</Text>
              </Overlay>
            </Box>
          ) : null}
          {showAuto ? <Autocomplete commands={suggestions} selected={autoSelected} /> : null}
          {error ? <Text color={theme.danger}>✗ {error}</Text> : null}
          {busy ? (
            <Text>
            <Text color={theme.accent}>
              {`  ${SPINNER_FRAMES[blink % SPINNER_FRAMES.length]} ${busyStatus(busyElapsedSecs, streaming?.length ?? 0)}`}
            </Text>
            <Text dimColor>
              {queued > 0 ? ` · ${queued} queued` : ""}
              {busyElapsedSecs > 10 ? " · /btw to ask aside" : ""} · esc ×2 to interrupt
            </Text>
            </Text>
          ) : null}
          {plan.length ? <PlanBoard plan={plan} /> : null}
          <InputBox value={input} cursor={cursor} active={!busy} />
          <StatusBar
            model={session.model}
            tokens={tokens}
            streaming={busy}
            note={note || undefined}
            cost={cost}
            sessionId={session.id}
            sessionTitle={session.title}
            tip={statusTip}
            contextPercent={ctxPercent}
          />
        </Box>
      ) : null}
    </Box>
  );
}
