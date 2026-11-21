import { useState } from "react";
import { Button, Group, Modal, Stack, Textarea, Checkbox, Menu, ActionIcon } from "@mantine/core";
import { IconDots, IconSend, IconBan } from "@tabler/icons-react";
import { call } from "../lib/call";

/** Resend / revoke actions for an active code. */
export function CodeActions({ code, compact }: { code: any; compact?: boolean }) {
  const [revoke, setRevoke] = useState(false);
  const [reason, setReason] = useState("");
  const [reissue, setReissue] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!["generated", "sent"].includes(code.status)) return null;

  const resend = () => call("resendSerialCode", { codeId: code.id }, `Code emailed to ${code.customerEmail}`).catch(() => undefined);
  const doRevoke = async () => {
    setBusy(true);
    try {
      await call("revokeSerialCode", { codeId: code.id, reason, reissue }, reissue ? "Code revoked and a new one emailed" : "Code revoked");
      setRevoke(false);
    } catch { /* toast */ } finally { setBusy(false); }
  };

  return (
    <>
      {compact ? (
        <Menu position="bottom-end">
          <Menu.Target><ActionIcon variant="subtle"><IconDots size={16} /></ActionIcon></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconSend size={14} />} onClick={resend}>{code.status === "generated" ? "Email code" : "Resend email"}</Menu.Item>
            <Menu.Item leftSection={<IconBan size={14} />} color="red" onClick={() => setRevoke(true)}>Revoke…</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ) : (
        <Group gap="xs">
          <Button size="xs" variant="light" leftSection={<IconSend size={14} />} onClick={resend}>{code.status === "generated" ? "Email code" : "Resend email"}</Button>
          <Button size="xs" variant="subtle" color="red" onClick={() => setRevoke(true)}>Revoke</Button>
        </Group>
      )}
      <Modal opened={revoke} onClose={() => setRevoke(false)} title={`Revoke code …${code.last4}`}>
        <Stack>
          <Textarea label="Reason" required placeholder="e.g. Customer says they never received it / code leaked" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
          <Checkbox label="Issue and email a new code to the same customer" checked={reissue} onChange={(e) => setReissue(e.currentTarget.checked)} />
          <Button color="red" onClick={doRevoke} loading={busy} disabled={!reason.trim()}>Revoke code</Button>
        </Stack>
      </Modal>
    </>
  );
}
