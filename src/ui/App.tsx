import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Config } from "../config/types.js";
import { removeConfig } from "../config/store.js";
import { isAbortError, streamChat, type Usage } from "../provider/client.js";
import { createSession, listSessions, loadSession, saveSession } from "../session/history.js";
import type { Message, Session, ToolCall } from "../session/types.js";
import { executeTool, systemPrompt, toolSchemas } from "../tools/index.js";
import type { ToolContext } from "../tools/types.js";
import { Autocomplete } from "./Autocomplete.js";
import { COMMANDS, filterCommands, matchCommand } from "./commands.js";
import { InputBox } from "./InputBox.js";
import { ChatViewport, buildChatLines } from "./MessageList.js";
import { ModelPicker } from "./ModelPicker.js";
import { Overlay } from "./Overlay.js";
import { SessionPicker } from "./SessionPicker.js";
import { StatusBar } from "./StatusBar.js";
import { theme } from "./theme.js";
import { Splash } from "./Welcome.js";
import { cycleHistory } from "./history.js";

type OverlayKind = "model" | "sessions" | "help" | "logout" | null;

interface ConfirmRequest {
  title: string;
  detail: string;
  resolve: (allowed: boolean) => void;
}

const MAX_ROUNDS = 10;
const MAX_TOOL_OUTPUT = 8_000;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SCROLL_STEP = 4;

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

export function App({ config, session: initialSession }: { config: Config; session: Session }) {
  const [session, setSession] = useState<Session>(initialSession);
  const [completed, setCompleted] = useState<Message[]>(initialSession.messages);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tokens, setTokens] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [autoSelected, setAutoSelected] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [blink, setBlink] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef("");
  const inputRef = useRef("");
  const cursorRef = useRef(0);
  const scrolledRef = useRef(false);

  function write(value: string, position: number): void {
    inputRef.current = value;
    cursorRef.current = Math.min(Math.max(position, 0), value.length);
    setInput(inputRef.current);
    setCursor(cursorRef.current);
  }
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [size, setSize] = useState({ rows: stdout.rows ?? 24, columns: stdout.columns ?? 80 });

  useEffect(() => {
    const update = () => setSize({ rows: stdout.rows ?? 24, columns: stdout.columns ?? 80 });
    stdout.on("resize", update);
    return () => {
      stdout.off("resize", update);
    };
  }, [stdout]);

  const rows = Math.max(size.rows, 10);
  const columns = Math.max(size.columns, 40);

  const busy = streaming !== null;
  const fresh = completed.length === 0;
  const suggestions = busy || overlay ? [] : filterCommands(input);
  const showAuto = suggestions.length > 0;

  useEffect(() => setAutoSelected(0), [input]);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setBlink((value) => value + 1), 120);
    return () => clearInterval(id);
  }, [busy]);

  useInput((character, key) => {
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
      if (key.escape) abortRef.current?.abort();
      return;
    }
    if (key.escape || key.tab && !showAuto) return;
    if (key.return) {
      run(showAuto ? suggestions[Math.min(autoSelected, suggestions.length - 1)].name : input);
      return;
    }
    if (key.tab && showAuto) {
      const next = suggestions[autoSelected].name + " ";
      write(next, next.length);
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

  async function submit(explicit?: string): Promise<void> {
    const content = (explicit ?? input).trim();
    if (!content) return;
    write("", 0);
    setError("");
    setScrollOffset(0);
    scrolledRef.current = false;
    rememberMessage(content);
    await send([
      ...session.messages,
      { role: "user", content, timestamp: new Date().toISOString() },
    ]);
  }

  async function send(messages: Message[]): Promise<void> {
    const base: Session = { ...session, messages };
    setCompleted(messages);
    setSession(base);
    setError("");
    setTokens(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const toolCtx: ToolContext = {
      cwd: process.cwd(),
      confirm: (title, detail) =>
        new Promise<boolean>((resolve) => setConfirmRequest({ title, detail, resolve })),
    };
    let convo = [...messages];
    let failure = "";
    let usage: Usage | undefined;
    let settled = false;

    try {
      for (let round = 0; round < MAX_ROUNDS && !controller.signal.aborted; round++) {
        const calls = await streamRound(base.model, convo, controller, (value) => (usage = value));
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

    saveSession({ ...base, messages: convo, updatedAt: new Date().toISOString() });
    setCompleted(convo);
    setSession({ ...base, messages: convo });
    if (!scrolledRef.current) setScrollOffset(0);
    setTokens(usage?.completion_tokens != null ? usage.completion_tokens : null);
    bufferRef.current = "";
    setStreaming(null);
    setError(failure);
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
        { role: "system", content: systemPrompt(process.cwd()), timestamp: new Date().toISOString() },
        ...convo,
      ];
      for await (const token of streamChat({ ...config, defaultModel: model }, payload, {
        signal: controller.signal,
        tools: toolSchemas(),
        onUsage,
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
    setError("");
  }

  function resume(id: string): void {
    try {
      const loaded = loadSession(id);
      setSession(loaded);
      setCompleted(loaded.messages);
      setTokens(null);
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
      case "/model":
        if (matched.arg) switchModel(matched.arg);
        else openOverlay("model");
        break;
      case "/sessions":
        openOverlay("sessions");
        break;
      case "/new":
        startNewChat();
        break;
      case "/logout":
        openOverlay("logout");
        break;
    }
  }

  const chat = useMemo(() => {
    const messages: Message[] =
      streaming !== null && streaming.length > 0
        ? [...completed, { role: "assistant", content: streaming, timestamp: new Date().toISOString() }]
        : completed;
    return buildChatLines(messages, columns);
  }, [completed, columns, streaming]);
  const chatBudget = Math.max(rows - 8 - (confirmRequest ? 13 : 0) - (error ? 3 : 0), 5);
  const maxOffset = Math.max(0, chat.length - chatBudget);
  const offset = Math.min(scrollOffset, maxOffset);
  const visibleLines = chat.slice(
    Math.max(0, chat.length - offset - chatBudget),
    Math.max(0, chat.length - offset),
  );
  const showChatBody = !overlay && (!fresh || confirmRequest !== null);

  const wheelUp = (): void => {
    scrolledRef.current = true;
    setScrollOffset((value) => value + SCROLL_STEP);
  };
  const wheelDown = (): void => setScrollOffset((value) => Math.max(0, value - SCROLL_STEP));

  return (
    <Box flexDirection="column">
      {fresh && !overlay && !confirmRequest ? (
        <Splash config={config} input={input} cursor={cursor} rows={rows} columns={columns} />
      ) : null}
      {overlay === "help" ? <HelpDialog onClose={closeOverlay} /> : null}
      {overlay === "logout" ? <LogoutDialog onClose={closeOverlay} onConfirm={logout} /> : null}
      {overlay === "model" ? (
        <ModelPicker config={config} onSelect={(id) => { closeOverlay(); if (id) switchModel(id); }} />
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
      {showChatBody ? (
        <Box height={rows} flexDirection="column" justifyContent="flex-end">
          <ChatViewport lines={visibleLines} />
          {offset > 0 ? (
            <Text dimColor>{`  ↑ ${offset} more lines above · pgDn / end returns to latest`}</Text>
          ) : null}
          {confirmRequest ? (
            <Box marginBottom={1}>
              <Overlay title="Allow action?">
                <Text bold>{confirmRequest.title}</Text>
                <Text> </Text>
                {confirmRequest.detail.split("\n").slice(0, 6).map((line, index) => (
                  <Text key={`${index}-${line.slice(0, 8)}`} dimColor>
                    {"  "}
                    {line.length > 100 ? `${line.slice(0, 100)}…` : line}
                  </Text>
                ))}
                <Text> </Text>
                <Text dimColor>{"  "}y allow · n / esc deny</Text>
              </Overlay>
            </Box>
          ) : null}
          {showAuto ? <Autocomplete commands={suggestions} selected={autoSelected} /> : null}
          {error ? <Text color={theme.danger}>✗ {error}</Text> : null}
          {busy ? (
            <Text color={theme.accent}>
              {`  ${SPINNER_FRAMES[blink % SPINNER_FRAMES.length]} Thinking…`}
            </Text>
          ) : null}
          <InputBox value={input} cursor={cursor} active={!busy} />
          <StatusBar model={session.model} tokens={tokens} streaming={busy} />
        </Box>
      ) : null}
    </Box>
  );
}
