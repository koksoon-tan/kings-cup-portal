import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import {
  Breadcrumbs, Anchor, Text, Group, Button, SimpleGrid, Paper, Table, Stack, TextInput, Textarea, Badge, CopyButton, ActionIcon, Tooltip, Switch, Alert,
} from "@mantine/core";
import { doc, collection, query, where, orderBy, updateDoc, serverTimestamp } from "firebase/firestore";
import { IconCopy, IconCheck, IconKey } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useCollection, useDocument } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { canAccess } from "../lib/roles";
import { PageHeader, Loading, Field, StatusBadge } from "../components/ui";
import { fmtDate, money, label } from "../lib/format";
import { call, toastError, toastOk } from "../lib/call";
import { logAudit } from "../lib/audit";
import { CodeActions } from "../components/CodeActions";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { role } = useAuth();
  const canCodes = canAccess(role, "codes");
  const cust = useDocument<any>(doc(db, "customers", id!), [id]);
  const orders = useCollection<any>(query(collection(db, "orders"), where("customerId", "==", id), orderBy("createdAt", "desc")), [id]);
  const codes = useCollection<any>(canCodes ? query(collection(db, "serialCodes"), where("customerId", "==", id), orderBy("generatedAt", "desc")) : null, [id, canCodes]);
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<Record<string, boolean>>({});

  useEffect(() => { if (cust.data) setF({ name: cust.data.name ?? "", email: cust.data.email ?? "", phone: cust.data.phone ?? "", country: cust.data.country ?? "", notes: cust.data.notes ?? "", banned: !!cust.data.banned }); }, [cust.data?.updatedAt?.seconds, !!cust.data]);

  if (cust.loading || !f) return cust.loading || cust.data ? <Loading /> : <Text>Customer not found.</Text>;
  const c = cust.data!;

  const save = async () => {
    try {
      await updateDoc(doc(db, "customers", id!), { ...f, email: f.email.trim().toLowerCase(), updatedAt: serverTimestamp() });
      logAudit("customer.update", "customers", id!, { email: f.email, banned: f.banned });
      toastOk("Saved");
    } catch (e) { toastError(e); }
  };
  const issue = async () => {
    setBusy(true);
    try { await call("issueSerialCode", { customerId: id, sendEmail: true }, `Code generated and emailed to ${c.email}`); }
    catch { /* toast */ } finally { setBusy(false); }
  };
  const canIssue = canCodes && !["generated", "sent", "redeemed"].includes(c.codeStatus);

  return (
    <>
      <Breadcrumbs mb="xs"><Anchor component={Link} to="/customers" size="sm">Customers</Anchor><Text size="sm">{c.name || c.email}</Text></Breadcrumbs>
      <PageHeader title={c.name || c.email || "Customer"} subtitle={`First bought via ${label(c.source)} · customer since ${fmtDate(c.createdAt)}`}
        actions={canIssue && (
          <Tooltip label={c.email ? "" : "Add an email address first"} disabled={!!c.email}>
            <Button leftSection={<IconKey size={16} />} onClick={issue} loading={busy} disabled={!c.email}>Generate &amp; email app code</Button>
          </Tooltip>
        )} />

      <SimpleGrid cols={{ base: 2, md: 4 }} mb="lg">
        <Paper withBorder p="sm"><Field label="App code"><StatusBadge status={c.codeStatus ?? "none"} size="md" /></Field></Paper>
        <Paper withBorder p="sm"><Field label="Redeemed">{fmtDate(c.redeemedAt, true)}</Field></Paper>
        <Paper withBorder p="sm"><Field label="Orders">{c.orderCount ?? 0}</Field></Paper>
        <Paper withBorder p="sm"><Field label="Total spent">{money(c.totalSpent ?? 0)}</Field></Paper>
      </SimpleGrid>

      {canCodes && (
        <Paper withBorder p="md" mb="lg">
          <Text fw={600} mb="sm">App serial codes</Text>
          {!codes.data.length ? <Text size="sm" c="dimmed">No code issued yet.</Text> : (
            <Table.ScrollContainer minWidth={800}>
              <Table>
                <Table.Thead><Table.Tr><Table.Th>Code</Table.Th><Table.Th>Status</Table.Th><Table.Th>Email</Table.Th><Table.Th>Generated</Table.Th><Table.Th>Sent</Table.Th><Table.Th>Redeemed</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {codes.data.map((k) => (
                    <Table.Tr key={k.id}>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Text ff="monospace" size="sm" style={{ cursor: "pointer" }} onClick={() => setShow({ ...show, [k.id]: !show[k.id] })}>
                            {show[k.id] ? k.code : `KC-••••-••••-${k.last4}`}
                          </Text>
                          <CopyButton value={k.code}>{({ copied, copy }) => <ActionIcon size="sm" variant="subtle" onClick={copy}>{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}</ActionIcon>}</CopyButton>
                        </Group>
                        {k.revokedReason && <Text size="xs" c="red">Revoked: {k.revokedReason}</Text>}
                      </Table.Td>
                      <Table.Td><StatusBadge status={k.status} /></Table.Td>
                      <Table.Td><StatusBadge status={k.emailStatus} />{k.emailError && <Text size="xs" c="red">{k.emailError}</Text>}<Text size="xs" c="dimmed">{k.customerEmail}{k.sendCount > 1 ? ` · sent ${k.sendCount}×` : ""}</Text></Table.Td>
                      <Table.Td><Text size="xs">{fmtDate(k.generatedAt, true)}</Text></Table.Td>
                      <Table.Td><Text size="xs">{fmtDate(k.lastSentAt, true)}</Text></Table.Td>
                      <Table.Td><Text size="xs">{fmtDate(k.redeemedAt, true)}</Text>{k.redeemedDevice && <Text size="xs" c="dimmed">{k.redeemedDevice}</Text>}</Table.Td>
                      <Table.Td><CodeActions code={k} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md">
          <Stack>
            <Text fw={600}>Profile</Text>
            <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
            <TextInput label="Email" description="Changing this doesn't resend the code. Use Resend email after you save." value={f.email} onChange={(e) => setF({ ...f, email: e.currentTarget.value })} />
            <Group grow>
              <TextInput label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.currentTarget.value })} />
              <TextInput label="Country" value={f.country} onChange={(e) => setF({ ...f, country: e.currentTarget.value })} />
            </Group>
            <Textarea label="Notes" autosize value={f.notes} onChange={(e) => setF({ ...f, notes: e.currentTarget.value })} />
            <Switch label="Blocked from the app" checked={f.banned} onChange={(e) => setF({ ...f, banned: e.currentTarget.checked })} />
            {c.appUid && <Text size="xs" c="dimmed">App account: {c.appUid}</Text>}
            <Group><Button onClick={save}>Save</Button></Group>
          </Stack>
        </Paper>
        <Paper withBorder p="md">
          <Text fw={600} mb="sm">Orders</Text>
          {!orders.data.length ? <Text size="sm" c="dimmed">No orders.</Text> : (
            <Table>
              <Table.Tbody>
                {orders.data.map((o) => (
                  <Table.Tr key={o.id}>
                    <Table.Td><Anchor component={Link} to={`/orders/${o.id}`} size="sm">{o.orderNo}</Anchor></Table.Td>
                    <Table.Td><Badge variant="outline" size="sm">{o.source}</Badge></Table.Td>
                    <Table.Td><Text size="sm">{fmtDate(o.orderDate ?? o.createdAt)}</Text></Table.Td>
                    <Table.Td ta="right">{money(o.total, o.currency)}</Table.Td>
                    <Table.Td><StatusBadge status={o.status} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          {!canCodes && c.codeStatus === "none" && <Alert mt="md" variant="light">Ops or admin staff can issue an app code to this customer.</Alert>}
        </Paper>
      </SimpleGrid>
    </>
  );
}
