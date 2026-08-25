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
  ["/retry · /undo", "regenerate or remove the last exchange"],
  ["/search · /export", "find old answers, save the chat"],
  ["/sessions", "resume a saved conversation"],
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
  useEffect(() => {
    const id = setInterval(() => setBlink((value) => !value), 500);
    return () => clearInterval(id);
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
    </Box>
  );
}
