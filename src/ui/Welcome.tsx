import { Box, Text, useStdout } from "ink";
import type { Config } from "../config/types.js";
import { theme } from "./theme.js";

const LOGO_TOP = "█▄░█ █▀█ ░░█ █▀█ ░░█ █▄░█ █▀█ ▀█▀";
const LOGO_BOTTOM = "█░▀█ █▀▄ ▄▄█ █▀▄ ▄▄█ █░▀█ █▄█ ░█░";
const BOT_START = 26;

const TIPS = [
  "Esc stops a reply mid-stream — the partial answer is kept",
  "/model opens a picker for any OpenRouter or self-hosted model",
  "Sessions save after every reply — /sessions to resume one",
  "Everything stays local: config and chats live in ~/.bajajbot",
];

export function Welcome({ config, input }: { config: Config; input: string }) {
  const { stdout } = useStdout();
  const rows = stdout.rows ?? 24;
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  return (
    <Box height={Math.max(rows - 1, 10)} flexDirection="column" justifyContent="center" alignItems="center" rowGap={1}>
      <Text dimColor>{LOGO_TOP}</Text>
      <Text>
        <Text dimColor>{LOGO_BOTTOM.slice(0, BOT_START)}</Text>
        <Text bold color={theme.accent}>{LOGO_BOTTOM.slice(BOT_START)}</Text>
      </Text>
      <Box marginTop={1} flexDirection="column" width={64} borderStyle="bold" borderLeft borderColor={theme.accent} paddingX={1}>
        {input ? (
          <Text>
            {input}
            <Text inverse> </Text>
          </Text>
        ) : (
          <Text dimColor>Ask anything… "/help"</Text>
        )}
        <Text>
          <Text color={theme.accent}>chat</Text>
          <Text dimColor> · {config.defaultModel} · {config.provider}</Text>
        </Text>
      </Box>
      <Text dimColor>/model models · /sessions chats · /help commands</Text>
      <Box marginTop={2}>
        <Text>
          <Text color={theme.accent}>● Tip </Text>
          <Text dimColor>{tip}</Text>
        </Text>
      </Box>
    </Box>
  );
}
