import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Table, Anchor, Group, Select, Text, TextInput, Button, Paper } from "@mantine/core";
import { collection, query, where, orderBy, limit, doc, getDoc } from "firebase/firestore";
import { IconSearch } from "@tabler/icons-react";
import Papa from "papaparse";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/hooks";
import { PageHeader, StatusBadge, Empty, Loading } from "../components/ui";
import { fmtDate, label, toDate } from "../lib/format";
import { CodeActions } from "../components/CodeActions";
import { toastError } from "../lib/call";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function CodesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status");
  const [max, setMax] = useState(200);
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<any | null>(null);
  const codes = useCollection<any>(
    status ? query(collection(db, "serialCodes"), where("status", "==", status), orderBy("generatedAt", "desc"), limit(max))
      : query(collection(db, "serialCodes"), orderBy("generatedAt", "desc"), limit(max)),
    [status, max]);

  const find = async () => {
    const raw = lookup.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const norm = raw.startsWith("KC") ? raw.slice(2) : raw;
    if (norm.length !== 12) return toastError({ message: "Enter the full code, e.g. KC-ABCD-EFGH-JKMN" });
    const snap = await getDoc(doc(db, "serialCodes", await sha256(norm)));
    setFound(snap.exists() ? { id: snap.id, ...snap.data() } : false);
  };

  const exportCsv = () => {
    const csv = Papa.unparse(codes.data.map((c) => ({
      code: c.code, status: c.status, customer: c.customerName, email: c.customerEmail, source: c.source, emailStatus: c.emailStatus,
      generatedAt: toDate(c.generatedAt)?.toISOString() ?? "", sentAt: toDate(c.lastSentAt)?.toISOString() ?? "",
      redeemedAt: toDate(c.redeemedAt)?.toISOString() ?? "", device: c.redeemedDevice ?? "",
    })));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `serial-codes-${status ?? "all"}.csv`;
    a.click();
  };

  const row = (c: any) => (
    <Table.Tr key={c.id}>
      <Table.Td><Text ff="monospace" size="sm">KC-••••-••••-{c.last4}</Text></Table.Td>
      <Table.Td><Anchor component={Link} to={`/customers/${c.customerId}`} size="sm">{c.customerName || c.customerEmail}</Anchor><Text size="xs" c="dimmed">{c.customerEmail}</Text></Table.Td>
      <Table.Td><Text size="sm">{label(c.source)}</Text></Table.Td>
      <Table.Td><StatusBadge status={c.status} /></Table.Td>
      <Table.Td><StatusBadge status={c.emailStatus} /></Table.Td>
      <Table.Td><Text size="xs">{fmtDate(c.generatedAt, true)}</Text></Table.Td>
      <Table.Td><Text size="xs">{fmtDate(c.lastSentAt, true)}</Text></Table.Td>
      <Table.Td><Text size="xs">{fmtDate(c.redeemedAt, true)}</Text></Table.Td>
      <Table.Td><CodeActions code={c} compact /></Table.Td>
    </Table.Tr>
  );
  const head = (
    <Table.Thead><Table.Tr><Table.Th>Code</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Source</Table.Th><Table.Th>Status</Table.Th><Table.Th>Email</Table.Th><Table.Th>Generated</Table.Th><Table.Th>Last sent</Table.Th><Table.Th>Redeemed</Table.Th><Table.Th /></Table.Tr></Table.Thead>
  );

  return (
    <>
      <PageHeader title="Serial codes" subtitle="One code per customer to unlock the mobile app. Each code works only once."
        actions={<Button variant="light" onClick={exportCsv} disabled={!codes.data.length}>Export CSV</Button>} />
      <Group mb="md" align="flex-end">
        <Select placeholder="All statuses" clearable value={status} w={170}
          onChange={(v) => { const p = new URLSearchParams(params); v ? p.set("status", v) : p.delete("status"); setParams(p); }}
          data={["generated", "sent", "redeemed", "revoked", "expired"].map((x) => ({ value: x, label: label(x) }))} />
        <TextInput placeholder="Look up a full code…" leftSection={<IconSearch size={16} />} value={lookup} onChange={(e) => { setLookup(e.currentTarget.value); setFound(null); }} onKeyDown={(e) => e.key === "Enter" && find()} w={260} />
        <Button variant="default" onClick={find}>Find</Button>
      </Group>
      {found === false && <Paper withBorder p="sm" mb="md"><Text c="red" size="sm">No such code.</Text></Paper>}
      {found && <Paper withBorder p="sm" mb="md"><Table.ScrollContainer minWidth={900}><Table>{head}<Table.Tbody>{row(found)}</Table.Tbody></Table></Table.ScrollContainer></Paper>}
      {codes.loading ? <Loading /> : !codes.data.length ? <Empty>No codes yet. They're created automatically when orders are paid, or from a customer's page.</Empty> : (
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover>{head}<Table.Tbody>{codes.data.map(row)}</Table.Tbody></Table>
        </Table.ScrollContainer>
      )}
      {codes.data.length >= max && <Button variant="subtle" mt="sm" onClick={() => setMax(max + 200)}>Load more</Button>}
    </>
  );
}
