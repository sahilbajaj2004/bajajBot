import { Box, Text, useInput, useStdout } from "ink";
import { Fragment, useState } from "react";
import type { Config } from "../config/types.js";
import { theme } from "./theme.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const LOGO_TOP =    "█▄▄ ▄▀█   █ ▄▀█   █ █▄▄ █▀█ ▀█▀";
const LOGO_BOTTOM = "█▄█ █▀█ █▄█ █▀█ █▄█ █▄█ █▄█  █ ";
const BOT_START = 25;

const STEPS = ["provider", "api key", "base url", "model", "review"] as const;
const LABEL_PAD = Math.max(...STEPS.map((step) => step.length));

const PROVIDERS = [
  { id: "openrouter" as const, name: "OpenRouter", hint: "one key · 400+ models" },
  { id: "custom" as const, name: "Custom endpoint", hint: "any OpenAI-compatible server" },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text dimColor>{"  " + label.padEnd(LABEL_PAD)}</Text>
      <Text>{value}</Text>
    </Box>
  );
}

function Field({
  label,
  value,
  placeholder,
  mask,
}: {
  label: string;
  value: string;
  placeholder?: string;
  mask?: boolean;
}) {
  const shown = mask ? "•".repeat(value.length) : value;
  return (
    <Box flexDirection="column" rowGap={0}>
      <Text bold>{`  ${label}`}</Text>
      <Box alignSelf="flex-start" borderStyle="round" borderColor={theme.accent} paddingX={1}>
        {shown ? (
          <Text>
            {shown}
            <Text inverse> </Text>
          </Text>
        ) : (
          <Text>
            <Text dimColor>{placeholder}</Text>
            <Text inverse> </Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}

function StepRail({ active }: { active: number }) {
  return (
    <Box>
      {STEPS.map((label, index) => (
        <Fragment key={label}>
          {index > 0 ? <Text dimColor>{" ── "}</Text> : null}
          <Text color={index <= active ? theme.accent : "gray"} bold={index === active}>
            {index < active ? "●" : index === active ? "◉" : "○"}
          </Text>
          <Text bold={index === active} color={index === active ? undefined : index < active ? theme.accent : "gray"}>
            {" "}
            {label.padEnd(label.length === LABEL_PAD ? LABEL_PAD : LABEL_PAD + 1)}
          </Text>
        </Fragment>
      ))}
    </Box>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{"  " + children}</Text>
    </Box>
  );
}

export function SetupWizard({ onFinish }: { onFinish: (config?: Config) => void }) {
  const { stdout } = useStdout();
  const columns = stdout.columns ?? 80;
  const wide = columns >= 62;
  const cardWidth = Math.min(64, Math.max(columns - 2, 40));

  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const provider = PROVIDERS[choice].id;
  const resolvedUrl = (baseUrl.trim() || (provider === "openrouter" ? OPENROUTER_URL : "")).replace(/\/$/, "");

  const advance = () => {
    setError("");
    setStep((current) => current + 1);
  };
  const back = () => {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  };
  const save = () => {
    setSaved(true);
    setTimeout(
      () =>
        onFinish({
          provider,
          apiKey: apiKey.trim(),
          baseUrl: resolvedUrl,
          defaultModel: defaultModel.trim(),
        }),
      900,
    );
  };

  useInput((input, key) => {
    if (saved) return;
    if (key.ctrl && input === "c") return onFinish();
    if (key.escape) return onFinish();

    if (step === 0) {
      if (key.upArrow || input === "k") return setChoice((current) => Math.max(0, current - 1));
      if (key.downArrow || input === "j") return setChoice((current) => Math.min(PROVIDERS.length - 1, current + 1));
      if (input === "1" || input === "2") return setChoice(Number(input) - 1);
      if (key.return) {
        setBaseUrl(provider === "openrouter" ? OPENROUTER_URL : "");
        return advance();
      }
      return;
    }

    if (step >= 1 && step <= 3) {
      if (key.tab && key.shift) return back();
      if (key.return) {
        if (step === 1) {
          if (!apiKey.trim()) return setError("API key is required.");
          return advance();
        }
        if (step === 2) {
          try {
            new URL(resolvedUrl);
          } catch {
            return setError("Enter a valid URL.");
          }
          setBaseUrl(resolvedUrl);
          return advance();
        }
        if (!defaultModel.trim()) return setError("Default model is required.");
        return advance();
      }
      const setter = [setApiKey, setBaseUrl, setDefaultModel][step - 1];
      if (key.backspace || key.delete) return setter((value) => value.slice(0, -1));
      if (key.ctrl || key.meta || !input) return;
      setter((value) => value + input);
      setError("");
      return;
    }

    if (step === 4) {
      if (key.tab && key.shift) return back();
      if (key.return) return save();
    }
  });

  const maskedKey =
    apiKey.length <= 8 ? "•".repeat(apiKey.length) : `${apiKey.slice(0, 2)}${"•".repeat(Math.min(apiKey.length - 4, 20))}${apiKey.slice(-2)}`;

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1} rowGap={1}>
      {wide ? (
        <Box flexDirection="column" alignItems="center">
          <Text dimColor>{LOGO_TOP}</Text>
          <Text>
            <Text dimColor>{LOGO_BOTTOM.slice(0, BOT_START)}</Text>
            <Text bold color={theme.accent}>
              {LOGO_BOTTOM.slice(BOT_START)}
            </Text>
          </Text>
        </Box>
      ) : null}
      <Box flexDirection="column" width={cardWidth} borderStyle="round" borderColor={theme.accent} paddingX={2} paddingY={1}>
        {saved ? (
          <Box flexDirection="column" rowGap={1} alignItems="center">
            <Text>
              <Text color="green" bold>
                ✓ Configuration saved
              </Text>
            </Text>
            <Text dimColor>~/.bajajbot/config.json</Text>
          </Box>
        ) : (
          <>
            <Box justifyContent="space-between">
              <Text>
                <Text color={theme.accent}>⚡ </Text>
                <Text bold>bajajbot setup</Text>
              </Text>
              <Text dimColor>step {Math.min(step + 1, 5)}/5</Text>
            </Box>
            <Box marginTop={1} marginBottom={1}>
              <StepRail active={step} />
            </Box>
            {step === 0 ? (
              <Box flexDirection="column">
                {PROVIDERS.map((option, index) => {
                  const isActive = index === choice;
                  return (
                    <Box key={option.id}>
                      <Text color={isActive ? theme.accent : undefined}>{isActive ? "  › " : "    "}</Text>
                      <Text bold={isActive} color={isActive ? theme.accent : undefined}>
                        {option.name.padEnd(17)}
                      </Text>
                      <Text dimColor>{option.hint}</Text>
                    </Box>
                  );
                })}
                <Hint>↑↓ choose · 1/2 quick-pick · enter continue · esc quit</Hint>
              </Box>
            ) : null}
            {step === 1 ? (
              <>
                <Field label="API key" value={apiKey} mask placeholder="paste your key…" />
                <Hint>enter continue · ⇧tab back · esc exit</Hint>
              </>
            ) : null}
            {step === 2 ? (
              <>
                <Field
                  label="Base URL"
                  value={baseUrl}
                  placeholder={provider === "openrouter" ? OPENROUTER_URL : "http://localhost:1234/v1"}
                />
                <Hint>enter continue · ⇧tab back · esc exit</Hint>
              </>
            ) : null}
            {step === 3 ? (
              <>
                <Field label="Default model" value={defaultModel} placeholder="e.g. anthropic/claude-sonnet-4.5" />
                <Hint>browse models later with /model · enter save · esc exit</Hint>
              </>
            ) : null}
            {step === 4 ? (
              <>
                <Row label="provider" value={PROVIDERS[choice].name} />
                <Row label="api key" value={maskedKey} />
                <Row label="base url" value={resolvedUrl} />
                <Row label="model" value={defaultModel.trim()} />
                <Hint>enter save & launch · ⇧tab edit · esc exit</Hint>
              </>
            ) : null}
            {error ? (
              <Box marginTop={1}>
                <Text color="red">{"  ✗ " + error}</Text>
              </Box>
            ) : null}
          </>
        )}
      </Box>
      {!wide ? <Text dimColor>⚡ bajajbot setup</Text> : null}
    </Box>
  );
}
