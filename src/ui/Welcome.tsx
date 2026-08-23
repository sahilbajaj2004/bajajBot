import { Box, Text } from "ink";
import type { Config } from "../config/types.js";
import { theme } from "./theme.js";

const LOGO_TOP    = "█▄▄ ▄▀█   █ ▄▀█   █ █▄▄ █▀█ ▀█▀";
const LOGO_BOTTOM = "█▄█ █▀█ █▄█ █▀█ █▄█ █▄█ █▄█  █ ";
const BOT_START = 25;

const FEATURES: Array<[string, string]> = [
  ["streaming", "replies appear live, rendered as markdown"],
  ["/model", "pick any OpenRouter or self-hosted model"],
  ["/sessions", "resume a saved conversation"],
  ["/new", "wipe the slate and start fresh"],
];

export function Splash({ config, input, rows, columns }: { config: Config; input: string; rows: number; columns: number }) {
  const wide = columns >= 62;
  const boxWidth = Math.min(64, Math.max(columns - 2, 20));
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
      <Box marginTop={1} flexDirection="column">
        {FEATURES.map(([name, description]) => (
          <Text key={name}>
            {"  "}
            <Text color={theme.accent}>{name.padEnd(wide ? 11 : 0)}</Text>
            {wide ? <Text dimColor>{description}</Text> : null}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column" width={boxWidth} borderStyle="round" borderColor={theme.accent} paddingX={1}>
        {input ? (
          <Text>
            {input}
            <Text inverse> </Text>
          </Text>
        ) : (
          <Text dimColor>Ask anything… "/help"</Text>
        )}
        <Text>
          <Text color={theme.accent}>● chat</Text>
          <Text dimColor> · {config.defaultModel} · {config.provider}</Text>
        </Text>
      </Box>
      <Text dimColor>{columns >= 48 ? "esc stop · ↑↓ history · everything stays local in ~/.bajajbot" : "esc stop · ↑↓ history"}</Text>
    </Box>
  );
}
