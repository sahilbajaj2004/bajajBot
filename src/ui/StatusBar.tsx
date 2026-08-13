import { Text } from "ink";
import type { Config } from "../config/types.js";

export function StatusBar({ config, sending }: { config: Config; sending: boolean }) {
  return <Text dimColor>{config.provider} · {config.defaultModel} · {sending ? "connecting" : "ready"}</Text>;
}
