import { Text, useInput } from "ink";
import { useState } from "react";
import type { CommitMessage, CommitStat } from "../tools/gitCommit.js";
import { Overlay } from "./Overlay.js";
import { theme } from "./theme.js";

export function CommitDialog({
  files,
  message,
  busy,
  onCommit,
  onRegenerate,
  onApplySubject,
  onClose,
}: {
  files: CommitStat[];
  message: CommitMessage;
  busy: boolean;
  onCommit: () => void;
  onRegenerate: () => void;
  onApplySubject: (subject: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<null | string>(null);

  useInput((input, key) => {
    if (key.escape) {
      if (editing !== null) return setEditing(null);
      if (!busy) onClose();
      return;
    }
    if (busy) return;
    if (editing !== null) {
      if (key.return) return onApplySubject(editing);
      if (key.backspace || key.delete) return setEditing(editing.slice(0, -1));
      if (!key.ctrl && !key.meta && input) return setEditing(editing + input);
      return;
    }
    if (key.ctrl && input?.toLowerCase() === "e") return setEditing(message.subject);
    if (key.return) return onCommit();
    if (input?.toLowerCase() === "y") return onCommit();
    if (input?.toLowerCase() === "n") return onRegenerate();
  });

  return (
    <Overlay title={busy ? "Commit · writing message…" : "Commit"}>
      {busy ? null : (
        <>
          <Text color={theme.accent} bold>
            {editing !== null ? `  › ${editing}` : `  ${message.subject || "(no subject)"}`}
          </Text>
          {message.body.map((line, index) => (
            <Text key={index} dimColor>
              {`  · ${line}`}
            </Text>
          ))}
          <Text> </Text>
          <Text dimColor>{`  ${files.length} file${files.length === 1 ? "" : "s"} staged for commit`}</Text>
          {files.slice(0, 10).map((file) => {
            const delta = file.added || file.deleted ? `  +${file.added} −${file.deleted}` : "";
            return (
              <Text key={file.path} dimColor>
                {`   ${file.status}  ${file.path}${delta}`}
              </Text>
            );
          })}
          {files.length > 10 ? <Text dimColor>{`   …and ${files.length - 10} more`}</Text> : null}
        </>
      )}
      <Text> </Text>
      <Text dimColor>
        {busy
          ? "  thinking…"
          : editing !== null
            ? "  type to edit subject · ↵ apply · esc cancel"
            : "  [y] commit · [n] new message · ⌃e edit · esc cancel"}
      </Text>
    </Overlay>
  );
}