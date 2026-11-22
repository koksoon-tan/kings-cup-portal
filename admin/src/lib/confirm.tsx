import { useState } from "react";
import { Text, Textarea, Button, Stack, Group } from "@mantine/core";
import { modals } from "@mantine/modals";

/** In-app replacement for window.confirm (which embedded/sandboxed pages may block). */
export function askConfirm(message: string, confirmLabel = "Confirm", danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: "Please confirm",
      children: <Text size="sm">{message}</Text>,
      labels: { confirm: confirmLabel, cancel: "Cancel" },
      confirmProps: { color: danger ? "red" : undefined },
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    });
  });
}

function TextPrompt({ label, onDone }: { label: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState("");
  return (
    <Stack>
      <Textarea label={label} autosize minRows={2} value={v} onChange={(e) => setV(e.currentTarget.value)} data-autofocus />
      <Group justify="flex-end">
        <Button variant="default" onClick={() => onDone(null)}>Cancel</Button>
        <Button color="red" disabled={!v.trim()} onClick={() => onDone(v.trim())}>Continue</Button>
      </Group>
    </Stack>
  );
}

/** In-app replacement for window.prompt. Resolves null if cancelled. */
export function askText(title: string, label: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | null) => { if (!settled) { settled = true; resolve(v); modals.close(id); } };
    const id = modals.open({ title, onClose: () => done(null), children: <TextPrompt label={label} onDone={done} /> });
  });
}
