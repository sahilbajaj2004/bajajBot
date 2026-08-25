import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "../config/types.js";
import { removeConfig, saveConfig } from "../config/store.js";
import { isAbortError, streamChat, type Usage } from "../provider/client.js";
import { estimateCost, fetchModels, type ModelInfo } from "../provider/models.js";
import { toMarkdown } from "../session/export.js";
import { compactMessages, estimateTokens, tokenLimit } from "../session/compact.js";
import { loadAllSessions } from "../session/history.js";
import { addUsage, aggregateUsage, emptyUsage } from "../session/usage.js";
import { deriveSessionTitle } from "./title.js";
import { createSession, listSessions, loadSession, saveSession } from "../session/history.js";
import type { Message, Session, ToolCall } from "../session/types.js";
import { executeTool, systemPrompt, toolSchemas } from "../tools/index.js";
import { listSkills, readSkillFile } from "../tools/skills.js";
import { restoreMutations } from "../tools/undo.js";
import { createSnapshot, listSnapshots, restoreSnapshot } from "../tools/gitCheckpoints.js";
import type { FileMutation, ToolContext } from "../tools/types.js";
import { buildVisionContent, extractAttachments } from "../util/attachments.js";
import { listPathSuggestions } from "./pathSuggest.js";
import { Autocomplete } from "./Autocomplete.js";
import { COMMANDS, filterCommands, matchCommand } from "./commands.js";
import { copyToClipboard } from "./clipboard.js";
import { InputBox } from "./InputBox.js";
import { ChatViewport, buildChatLines, type Highlight } from "./MessageList.js";
import type { MouseStdin } from "./mouse.js";
import { ModelPicker } from "./ModelPicker.js";
import { Overlay } from "./Overlay.js";
import { ProfilePicker } from "./ProfilePicker.js";
import { SearchDialog, type SearchMatch } from "./SearchDialog.js";
import { SessionPicker } from "./SessionPicker.js";
import { SkillPicker } from "./SkillPicker.js";
import { SnapshotPicker } from "./SnapshotPicker.js";
import { UsagePanel } from "./UsagePanel.js";
import { extractSelectedText, normalizeRect, type Rect } from "./select.js";
import { StatusBar } from "./StatusBar.js";
import { sessionTitle, setTerminalTitle } from "./title.js";
import { DEFAULT_COLUMNS, DEFAULT_ROWS, theme } from "./theme.js";
import { Splash } from "./Welcome.js";
import { cycleHistory } from "./history.js";

type OverlayKind = "model" | "sessions" | "search" | "profile" | "usage" | "skills" | "checkpoints" | "help" | "logout" | null;

interface ConfirmRequest {
  title: string;
  detail: string;
  resolve: (allowed: boolean) => void;
}

const MAX_ROUNDS = 10;
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
  const [search, setSearch] = useState<{ query: string; matches: SearchMatch[] } | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [blink, setBlink] = useState(0);
  const [selection, setSelection] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  const [note, setNote] = useState("");
  const [queued, setQueued] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef("");
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

  function flashNote(text: string): void {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(""), 2000);
  }

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
    if (!busy) return;
    const id = setInterval(() => setBlink((value) => value + 1), 120);
    return () => clearInterval(id);
  }, [busy]);

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
      const request = confirmRequest;
      setConfirmRequest(null);
      if (character?.toLowerCase() === "y") request.resolve(true);
      else request.resolve(false);
      return;
    }
    if (overlay) return;
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
        abortRef.current?.abort();
        return;
      }
      if (key.return) {
        const content = input.trim();
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

  async function submit(explicit?: string, forceAttachments?: string[]): Promise<void> {
    const content = (explicit ?? input).trim();
    if (!content) return;
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

  async function send(input: Message[]): Promise<void> {
    const startedAt = Date.now();
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
      confirm: (title, detail) =>
        new Promise<boolean>((resolve) => setConfirmRequest({ title, detail, resolve })),
      recordMutation: (mutation) => mutations.push(mutation),
    };
    let convo = [...messages];
    let failure = "";
    let usage: Usage | undefined;
    const roundTokens = { prompt: 0, completion: 0 };
    let settled = false;

    try {
      for (let round = 0; round < MAX_ROUNDS && !controller.signal.aborted; round++) {
        const calls = await streamRound(base.model, convo, controller, (value) => {
          usage = value;
          roundTokens.prompt += value.prompt_tokens ?? 0;
          roundTokens.completion += value.completion_tokens ?? 0;
        });
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

    const hadTokens = roundTokens.prompt > 0 || roundTokens.completion > 0;
    const replyCost = hadTokens ? await costFor(base.model, roundTokens) : null;
    const finalSession: Session = {
      ...base,
      messages: convo,
      updatedAt: new Date().toISOString(),
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
    bufferRef.current = "";
    setStreaming(null);
    if (!failure && !controller.signal.aborted && Date.now() - startedAt > 3000) {
      stdoutRef.current?.write("\x07");
      flashNote("✓ Reply ready");
    }
    setError(failure);
    lastTurnMutationsRef.current = mutations;
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
      for await (const token of streamChat({ ...activeConfig, defaultModel: model }, payload, {
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
    setTokens(null);
    setCost(null);
    setError("");
  }

  function logout(): void {
    const removed = removeConfig();
    exit(removed ? "All BajajBot data removed. Run `bajajbot` to set up again." : "Nothing to remove.");
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

  const chat = useMemo(() => {
    const messages: Message[] =
      streaming !== null && streaming.length > 0
        ? [...completed, { role: "assistant", content: streaming, timestamp: new Date().toISOString() }]
        : completed;
    return buildChatLines(messages, columns);
  }, [completed, columns, streaming]);
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

  // Screen-row geometry of the chat viewport (bottom-anchored stack below it).
  const stackRows =
    (offset > 0 ? 1 : 0) +
    (confirmRequest ? Math.min(confirmRequest.detail.split("\n").length, 6) + 7 : 0) +
    (showAuto ? suggestions.length : 0) +
    (error ? 1 : 0) +
    (busy ? 1 : 0) +
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
      {overlay === "usage" ? <Overlay title="Usage"><UsagePanel totals={aggregateUsage(loadAllSessions())} /></Overlay> : null}
      {overlay === "skills" ? (
        <SkillPicker
          skills={listSkills(process.cwd())}
          onSelect={(name) => {
            closeOverlay();
            if (!name) return;
            const skill = listSkills(process.cwd()).find((entry) => entry.name === name);
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
      {overlay === "logout" ? <LogoutDialog onClose={closeOverlay} onConfirm={logout} /> : null}
      {overlay === "model" ? (
        <ModelPicker config={activeConfig} onSelect={(id) => { closeOverlay(); if (id) switchModel(id); }} />
      ) : null}
      {overlay === "profile" ? (
        <ProfilePicker profiles={activeConfig.profiles ?? {}} active={profileName} onSelect={applyProfile} />
      ) : null}
      {overlay === "sessions" ? (
        <SessionPicker
          sessions={listSessions()}
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
                {`  ${SPINNER_FRAMES[blink % SPINNER_FRAMES.length]} Working…`}
              </Text>
              <Text dimColor>
                {queued > 0 ? ` · ${queued} queued` : ""} · esc to interrupt
              </Text>
            </Text>
          ) : null}
          <InputBox value={input} cursor={cursor} active={!busy} />
          <StatusBar
            model={session.model}
            tokens={tokens}
            streaming={busy}
            note={note || undefined}
            cost={cost}
            contextPercent={Math.min(100, (estimateTokens(completed) / tokenLimit(activeConfig)) * 100)}
          />
        </Box>
      ) : null}
    </Box>
  );
}
