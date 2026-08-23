import { Box, Text, useApp, useInput, useStdout } from "ink";import { useEffect, useRef, useState } from "react";
import type { Config } from "../config/types.js";
import { removeConfig } from "../config/store.js";
import { isAbortError, streamChat, type Usage } from "../provider/client.js";
import { createSession, listSessions, loadSession, saveSession } from "../session/history.js";
import type { Message, Session } from "../session/types.js";
import { Autocomplete } from "./Autocomplete.js";
import { COMMANDS, filterCommands, matchCommand } from "./commands.js";
import { InputBox } from "./InputBox.js";
import { Markdown } from "./Markdown.js";
import { MessageList, blockHeight, visibleWindow } from "./MessageList.js";
import { ModelPicker } from "./ModelPicker.js";
import { Overlay } from "./Overlay.js";
import { SessionPicker } from "./SessionPicker.js";
import { StatusBar } from "./StatusBar.js";
import { theme } from "./theme.js";
import { Splash } from "./Welcome.js";
import { cycleHistory } from "./history.js";

type OverlayKind = "model" | "sessions" | "help" | "logout" | null;

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
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tokens, setTokens] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [autoSelected, setAutoSelected] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef("");
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

  useInput((character, key) => {
    if (overlay) return;
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
      setInput(suggestions[autoSelected].name + " ");
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
    if (key.backspace || key.delete) return setInput((value) => value.slice(0, -1));
    if (key.ctrl || key.meta || !character) return;
    const clean = character.replace(/[\x00-\x1f\x7f]/g, "");
    const hasBreak = /[\r\n]/.test(character);
    if (clean) setInput((value) => value + clean);
    if (hasBreak) run(input + clean);
  });

  function applyHistory(direction: -1 | 1) {
    const next = cycleHistory(sent, historyIndex, direction);
    setInput(next.draft);
    setHistoryIndex(next.index);
  }

  function rememberMessage(content: string): void {
    setSent((previous) => [...previous, content]);
    setHistoryIndex(null);
  }

  async function submit(explicit?: string): Promise<void> {
    const content = (explicit ?? input).trim();
    if (!content) return;
    setInput("");
    setError("");
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
    bufferRef.current = "";
    setStreaming("");
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    let usage: Usage | undefined;
    let failure = "";
    const flush = setInterval(() => setStreaming(bufferRef.current), 50);
    try {
      for await (const token of streamChat({ ...config, defaultModel: base.model }, messages, {
        signal: controller.signal,
        onUsage: (value) => {
          usage = value;
        },
      })) {
        bufferRef.current += token;
      }
    } catch (cause) {
      if (!isAbortError(cause)) failure = cause instanceof Error ? cause.message : String(cause);
    } finally {
      clearInterval(flush);
      abortRef.current = null;
    }
    finish(base, bufferRef.current, failure, usage);
  }

  function finish(base: Session, reply: string, failure: string, usage?: Usage): void {
    const done = reply
      ? [...base.messages, { role: "assistant" as const, content: reply, timestamp: new Date().toISOString() }]
      : base.messages;
    const next: Session = { ...base, messages: done, updatedAt: new Date().toISOString() };
    saveSession(next);
    setCompleted(done);
    setSession(next);
    setTokens(usage?.completion_tokens != null ? usage.completion_tokens : null);
    bufferRef.current = "";
    setStreaming(null);
    if (failure) setError(failure);
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
    setInput("");
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

  const streamReserve = busy ? blockHeight(streaming ?? "", "assistant", columns) : 0;
  const budget = Math.max(rows - 8 - streamReserve - (error ? 2 : 0), 3);

  return (
    <Box flexDirection="column">
      {fresh && !overlay ? <Splash config={config} input={input} rows={rows} columns={columns} /> : null}
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
      {!overlay && !fresh ? (
        <Box height={rows} flexDirection="column">
          <MessageList messages={visibleWindow(completed, columns, budget)} />
          <Box flexGrow={1} />
          {showAuto ? <Autocomplete commands={suggestions} selected={autoSelected} /> : null}
          {busy ? (
            <Box marginTop={1}>
              <Markdown content={streaming ?? ""} />
            </Box>
          ) : null}
          {error ? <Text color={theme.danger}>✗ {error}</Text> : null}
          <InputBox value={input} active={!busy} />
          <StatusBar model={session.model} tokens={tokens} streaming={busy} />
        </Box>
      ) : null}
    </Box>
  );
}
