import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { Config } from "../config/types.js";
import type { CommandDef } from "./commands.js";
import { Autocomplete } from "./Autocomplete.js";
import { theme } from "./theme.js";
import { BOT_START, LOGO_BOTTOM, LOGO_TOP } from "./logo.js";

const FEATURES: Array<[string, string]> = [
  ["streaming", "replies appear live, rendered as markdown"],
  ["/model", "pick any model — even unlisted ones"],
  ["/compare", "ask two models, keep the better answer"],
  ["/btw", "instant side question, never enters the chat"],
  ["/retry · /undo", "regenerate or remove the last exchange"],
  ["/search · /export", "find old answers, save the chat"],
  ["/sessions", "resume a saved conversation"],
];

const TIPS = [
  "Use /export to save the conversation as Markdown (or JSON)",
  "Use @src/app.ts to attach files — the model reads them automatically",
  "Type /btw to ask a quick side question without breaking the current task",
  "Everything stays local in ~/.bajajbot — no data leaves your machine",
  "Type /compare to pit two models against each other and keep the winner",
  "Type /subagent to fan out parallel research agents while you keep chatting",
  "Type /fallback to pick an auto-failover model chain for rate-limited turns",
  "Type /commit to have the AI draft a git commit message — press y to commit",
  "Type /route to auto-pick the model per message — e.g. big model for long rewrites",
  "The agent searches the web itself — just ask about something current",
  "press esc twice to interrupt a running turn (accidental-safe)",
  "Type /retry to regenerate a reply, /undo to remove the last exchange",
  "Type /usage to see tokens and cost across all your chats",
  "Switch looks with /theme, resume chats with /sessions",
  "Drag over text to copy it — works over SSH too",
  "Type /checkpoints to restore any file from a git snapshot",
  "Type /skills to browse playbooks and run one instantly",
];

export function Splash({
  config,
  input,
  cursor,
  rows,
  columns,
  suggestions = [],
  autoSelected = 0,
}: {
  config: Config;
  input: string;
  cursor: number;
  rows: number;
  columns: number;
  suggestions?: CommandDef[];
  autoSelected?: number;
}) {
  const [blink, setBlink] = useState(true);
  const [tipIndex, setTipIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBlink((value) => !value), 500);
    const tipId = setInterval(() => setTipIndex((value) => (value + 1) % TIPS.length), 5000);
    return () => {
      clearInterval(id);
      clearInterval(tipId);
    };
  }, []);
  const wide = columns >= 62;
  const boxWidth = Math.min(64, Math.max(columns - 2, 20));
  const position = Math.min(Math.max(cursor, 0), input.length);
  return (
    <Box height={Math.max(rows - 1, 8)} flexDirection="column" justifyContent="center" alignItems="center" rowGap={1}>
      {wide ? (
        <Box flexDirection="column" alignItems="center">
          <Text dimColor>{LOGO_TOP}</Text>
          <Text>
            <Text dimColor>{LOGO_BOTTOM.slice(0, BOT_START)}</Text>
            <Text bold color={theme.accent}>{LOGO_BOTTOM.slice(BOT_START)}</Text>
          </Text>
        </Box>
      ) : null}
      <Text>
        <Text color={theme.accent}>⚡ </Text>
        <Text bold>bajajbot</Text>
        {wide ? <Text dimColor> — terminal AI chat</Text> : null}
      </Text>
      {!suggestions.length ? (
        <Box marginTop={1} flexDirection="column">
          {FEATURES.map(([name, description]) => (
            <Text key={name}>
              {"  "}
              <Text color={theme.accent}>{name.padEnd(wide ? 11 : 0)}</Text>
              {wide ? <Text dimColor>{description}</Text> : null}
            </Text>
          ))}
        </Box>
      ) : null}
      {suggestions.length ? (
        <Box flexDirection="column" width={boxWidth}>
          <Autocomplete commands={suggestions} selected={autoSelected} />
        </Box>
      ) : null}
      <Box marginTop={suggestions.length ? 0 : 1} flexDirection="column" width={boxWidth} borderStyle="round" borderColor={theme.accent} paddingX={1}>
        {input ? (
          <Text>
            {input.slice(0, position)}
            {position < input.length ? (
              <Text inverse={blink}>{input.slice(position, position + 1)}</Text>
            ) : (
              <Text inverse={blink}> </Text>
            )}
            {input.slice(position + 1)}
          </Text>
        ) : (
          <Text dimColor>
            {`Ask anything… "/help"`}
            {blink ? <Text inverse> </Text> : " "}
          </Text>
        )}
        <Text>
          <Text color={theme.accent}>● chat</Text>
          <Text dimColor> · {config.defaultModel} · {config.provider}</Text>
        </Text>
      </Box>
      <Text dimColor>{columns >= 48 ? "esc interrupt · ↑↓ history · everything stays local in ~/.bajajbot" : "esc interrupt · ↑↓ history"}</Text>
      <Text>
        <Text color={theme.accent}>● Tip </Text>
        <Text dimColor>{TIPS[tipIndex]}</Text>
      </Text>
    </Box>
  );
}
