import { Box, Text, useInput } from "ink";
import type { ChangedFile } from "../tools/gitCheckpoints.js";
import { theme } from "./theme.js";
import { Overlay } from "./Overlay.js";
import { useWindow, WindowHint } from "./ModelPicker.js";

const STATUS_COLOR: Record<ChangedFile["status"], string> = {
  A: theme.success,
  M: "yellow",
  D: theme.danger,
};

const STATUS_LABEL: Record<ChangedFile["status"], string> = {
  A: "created",
  M: "edited ",
  D: "deleted",
};

export function ChangesOverlay({
  files,
  onClose,
}: {
  files: ChangedFile[];
  onClose: () => void;
}) {
  useInput((_input, key) => {
    if (key.escape || key.return) onClose();
  });
  const active = 0;
  const { viewSize, start } = useWindow(files.length, active);
  const visible = files.slice(start, start + viewSize);

  return (
    <Overlay title="Session changes">
      {files.length === 0 ? (
        <Text dimColor>{" No file changes recorded — checkpoints need a git project and at least two replies."}</Text>
      ) : (
        visible.map((file) => (
          <Text key={`${file.status}-${file.path}`}>
            <Text color={STATUS_COLOR[file.status]} bold>
              {` ${file.status} `}
            </Text>
            <Text dimColor>{`${STATUS_LABEL[file.status]} · `}</Text>
            <Text>{file.path.length > 60 ? `…${file.path.slice(-59)}` : file.path}</Text>
          </Text>
        ))
      )}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>A created · M edited · D deleted (vs session start)</Text>
        {files.length > 0 ? <Text dimColor>{files.length} file(s)</Text> : null}
      </Box>
      <WindowHint shown={viewSize} total={files.length} />
      <Text dimColor>esc close</Text>
    </Overlay>
  );
}
