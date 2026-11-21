import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Table, Anchor, Group, TextInput, Select, Text, Badge, Button, Modal, Stack } from "@mantine/core";
import { collection, query, orderBy, limit, where, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { IconSearch, IconPlus } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/hooks";
import { PageHeader, StatusBadge, Empty, Loading } from "../components/ui";
import { fmtDate, money, label, SOURCES } from "../lib/format";
import { toastError } from "../lib/call";
import { logAudit } from "../lib/audit";

export default function CustomersPage() {
  const [max, setMax] = useState(200);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [codeStatus, setCodeStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", country: "", source: "manual" });
  const nav = useNavigate();
  const customers = useCollection<any>(query(collection(db, "customers"), orderBy("createdAt", "desc"), limit(max)), [max]);

  const s = search.trim().toLowerCase();
  const rows = customers.data.filter((c) =>
    (!source || c.sources?.includes(source) || c.source === source) &&
    (!codeStatus || (c.codeStatus ?? "none") === codeStatus) &&
    (!s || [c.name, c.email, c.phone].some((v) => String(v ?? "").toLowerCase().includes(s))));

  const create = async () => {
    const email = f.email.trim().toLowerCase();
    if (!f.name.trim() && !email) return toastError({ message: "Enter a name or email." });
    try {
      if (email && !(await getDocs(query(collection(db, "customers"), where("email", "==", email), limit(1)))).empty) {
        return toastError({ message: "A customer with this email already exists." });
      }
      const ref = await addDoc(collection(db, "customers"), {
        name: f.name.trim(), email, phone: f.phone.trim(), country: f.country.trim(), source: f.source, sourceRef: "",
        sources: [f.source], codeStatus: "none", notes: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      logAudit("customer.create", "customers", ref.id, { email });
      nav(`/customers/${ref.id}`);
    } catch (e) { toastError(e); }
  };

  return (
    <>
      <PageHeader title="Customers" subtitle="Everyone who bought a deck, where they bought it, and their app code status"
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>Add customer</Button>} />
      <Group mb="md">
        <TextInput placeholder="Search name, email, phone" leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={260} />
        <Select placeholder="Any source" clearable value={source} onChange={setSource} data={SOURCES.map((x) => ({ value: x, label: label(x) }))} w={150} />
        <Select placeholder="Any code status" clearable value={codeStatus} onChange={setCodeStatus} data={["none", "generated", "sent", "redeemed", "revoked", "expired"].map((x) => ({ value: x, label: label(x) }))} w={170} />
      </Group>
      {customers.loading ? <Loading /> : !rows.length ? <Empty>No customers found.</Empty> : (
        <Table.ScrollContainer minWidth={760}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Source</Table.Th><Table.Th ta="right">Orders</Table.Th><Table.Th ta="right">Spent</Table.Th><Table.Th>App code</Table.Th><Table.Th>Since</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {rows.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td><Anchor component={Link} to={`/customers/${c.id}`} fw={600}>{c.name || c.email || "(no name)"}</Anchor><Text size="xs" c="dimmed">{c.email}</Text></Table.Td>
                  <Table.Td><Group gap={4}>{(c.sources ?? [c.source]).map((x: string) => <Badge key={x} variant="outline" size="sm">{x}</Badge>)}</Group></Table.Td>
                  <Table.Td ta="right">{c.orderCount ?? 0}</Table.Td>
                  <Table.Td ta="right">{money(c.totalSpent ?? 0)}</Table.Td>
                  <Table.Td><Group gap={6}><StatusBadge status={c.codeStatus ?? "none"} />{c.codeLast4 && <Text size="xs" c="dimmed">…{c.codeLast4}</Text>}</Group></Table.Td>
                  <Table.Td><Text size="sm">{fmtDate(c.createdAt)}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {customers.data.length >= max && <Button variant="subtle" mt="sm" onClick={() => setMax(max + 200)}>Load more</Button>}
      <Modal opened={open} onClose={() => setOpen(false)} title="Add customer">
        <Stack>
          <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
          <TextInput label="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.currentTarget.value })} />
          <TextInput label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.currentTarget.value })} />
          <TextInput label="Country" value={f.country} onChange={(e) => setF({ ...f, country: e.currentTarget.value })} />
          <Select label="Source of purchase" value={f.source} allowDeselect={false} onChange={(v) => setF({ ...f, source: v! })} data={SOURCES.map((x) => ({ value: x, label: label(x) }))} />
          <Text size="xs" c="dimmed">Customers are normally created automatically from orders. Add one by hand for giveaways or manual sales.</Text>
          <Button onClick={create}>Add customer</Button>
        </Stack>
      </Modal>
    </>
  );
}
