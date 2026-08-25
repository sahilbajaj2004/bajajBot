import { Box, Text } from "ink";
import type { PlanItem } from "../session/types.js";
import { theme } from "./theme.js";

const MAX_ROWS = 5;

export function PlanBoard({ plan }: { plan: PlanItem[] }) {
  if (!plan.length) return null;
  const done = plan.filter((item) => item.status === "done").length;
  const complete = done === plan.length;
  const visible = plan.slice(0, MAX_ROWS);
  return (
    <Box flexDirection="column" paddingX={2}>
      <Text dimColor>
        {"  plan "}
        <Text bold color={complete ? theme.success : theme.accent}>
          {done}/{plan.length}
        </Text>
        {complete ? " ✓ complete" : ""}
      </Text>
      {visible.map((item, index) => {
        const mark = item.status === "done" ? "✓" : item.status === "in_progress" ? "▸" : "○";
        const color = item.status === "done" ? theme.success : item.status === "in_progress" ? theme.accent : undefined;
        return (
          <Text key={`${index}-${item.task}`} color={color} dimColor={item.status === "pending"}>
            {`  ${mark} ${item.task.length > 70 ? `${item.task.slice(0, 69)}…` : item.task}`}
          </Text>
        );
      })}
      {plan.length > visible.length ? <Text dimColor>{`  … +${plan.length - visible.length} more steps`}</Text> : null}
    </Box>
  );
}
