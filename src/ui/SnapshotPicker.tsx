import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { Snapshot } from "../tools/gitCheckpoints.js";
import { theme } from "./theme.js";
import { Overlay } from "./Overlay.js";
import { useWindow, WindowHint } from "./ModelPicker.js";

export function SnapshotPicker({
  snapshots,
  onRestore,
  onClose,
}: {
  snapshots: Snapshot[];
  onRestore: (sha: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const [armed, setArmed] = useState(false);
  const active = Math.min(selected, Math.max(0, snapshots.length - 1));
  const { viewSize, start } = useWindow(snapshots.length, active);
  const visible = snapshots.slice(start, start + viewSize);

  useInput((_input, key) => {
    if (key.escape) {
      if (armed) return setArmed(false);
      return onClose();
    }
    if (key.upArrow) return setSelected(Math.max(0, active - 1));
    if (key.downArrow) return setSelected(Math.min(snapshots.length - 1, active + 1));
    if (key.pageUp) return setSelected(0);
    if (key.pageDown) return setSelected(snapshots.length - 1);
    if (key.return && snapshots.length > 0) {
      if (!armed) return setArmed(true);
      onRestore(snapshots[active].sha);
    }
  });

  return (
    <Overlay title="Checkpoints">
      {snapshots.length === 0 ? (
        <Text dimColor>{" No checkpoints yet — they are created automatically after each reply (git projects only)."}</Text>
      ) : null}
      {visible.map((snapshot, index) => {
        const isActive = start + index === active;
        const isArmed = isActive && armed;
        return (
          <Text key={snapshot.sha} bold={isActive} color={isArmed ? theme.danger : isActive ? theme.accent : undefined}>
            {` ${isActive ? "›" : " "} ${snapshot.time.slice(0, 16).replace("T", " ")}`}
            <Text dimColor>{` · ${snapshot.label}`}</Text>
          </Text>
        );
      })}
      {armed ? (
        <Box marginTop={1}>
          <Text bold color={theme.danger}>
            {" ⚠ Restores all files to this snapshot. enter again to confirm · esc cancel"}
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>newest first · your branch/index stay untouched</Text>
        {snapshots.length > 0 ? (
          <Text dimColor>{active + 1}/{snapshots.length}</Text>
        ) : null}
      </Box>
      <WindowHint shown={viewSize} total={snapshots.length} />
      <Text dimColor>{armed ? "enter restore · esc cancel" : "↑↓ select · enter prepare restore · esc close"}</Text>
    </Overlay>
  );
}
