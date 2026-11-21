import { useState } from "react";
import { Button, Table, Modal, Stack, TextInput, PasswordInput, Select, Text, Badge, Group } from "@mantine/core";
import { collection, query, orderBy } from "firebase/firestore";
import { IconPlus } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { PageHeader, Loading } from "../components/ui";
import { ROLES, ROLE_DESCRIPTIONS } from "../lib/roles";
import { call } from "../lib/call";
import { fmtDate } from "../lib/format";

export default function StaffPage() {
  const { user } = useAuth();
  const staff = useCollection<any>(query(collection(db, "staff"), orderBy("email")));
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: "", displayName: "", role: "ops", password: "" });
  const [busy, setBusy] = useState(false);
  const roleData = [...ROLES.map((r) => ({ value: r, label: `${r} — ${ROLE_DESCRIPTIONS[r]}` }))];

  const create = async () => {
    setBusy(true);
    try { await call("createStaff", f, `${f.email} added`); setOpen(false); setF({ email: "", displayName: "", role: "ops", password: "" }); }
    catch { /* toast */ } finally { setBusy(false); }
  };
  const setRole = (uid: string, role: string | null) => call("setStaffRole", { uid, role }, role ? "Role updated" : "Access removed").catch(() => undefined);

  return (
    <>
      <PageHeader title="Staff" subtitle="Who can sign in to this dashboard and what they can do"
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>Add staff</Button>} />
      {staff.loading ? <Loading /> : (
        <Table.ScrollContainer minWidth={640}>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Staff</Table.Th><Table.Th>Role</Table.Th><Table.Th>Added</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {staff.data.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td><Text size="sm" fw={600}>{s.displayName || s.email}</Text><Text size="xs" c="dimmed">{s.email}</Text></Table.Td>
                  <Table.Td>
                    {s.disabled ? <Badge color="gray">No access</Badge> : (
                      <Select size="xs" w={150} value={s.role} allowDeselect={false} disabled={s.id === user?.uid} onChange={(v) => setRole(s.id, v)} data={ROLES} />
                    )}
                  </Table.Td>
                  <Table.Td><Text size="sm">{fmtDate(s.createdAt)}</Text></Table.Td>
                  <Table.Td ta="right">
                    {s.id !== user?.uid && (s.disabled
                      ? <Button size="xs" variant="light" onClick={() => setRole(s.id, "ops")}>Restore as ops</Button>
                      : <Button size="xs" variant="subtle" color="red" onClick={() => confirm(`Remove ${s.email}'s access?`) && setRole(s.id, null)}>Remove access</Button>)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Group mt="lg" gap="xl">{ROLES.map((r) => <Text key={r} size="xs" c="dimmed"><b>{r}</b>: {ROLE_DESCRIPTIONS[r]}</Text>)}</Group>
      <Modal opened={open} onClose={() => setOpen(false)} title="Add staff member">
        <Stack>
          <TextInput label="Email" required value={f.email} onChange={(e) => setF({ ...f, email: e.currentTarget.value })} />
          <TextInput label="Name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.currentTarget.value })} />
          <Select label="Role" data={roleData} value={f.role} allowDeselect={false} onChange={(v) => setF({ ...f, role: v! })} />
          <PasswordInput label="Temporary password" description="At least 10 characters. Ask them to reset it with 'Forgot password'." value={f.password} onChange={(e) => setF({ ...f, password: e.currentTarget.value })} />
          <Button onClick={create} loading={busy}>Create account</Button>
        </Stack>
      </Modal>
    </>
  );
}
