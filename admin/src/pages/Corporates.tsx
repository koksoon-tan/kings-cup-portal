import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Table, Anchor, Group, Select, TextInput, Text, Modal, Stack, Badge } from "@mantine/core";
import { collection, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/hooks";
import { PageHeader, StatusBadge, Empty, Loading } from "../components/ui";
import { fmtDate, label, CORP_PIPELINE, CORP_SEGMENTS } from "../lib/format";
import { toastError } from "../lib/call";
import { logAudit } from "../lib/audit";

export default function CorporatesPage() {
  const corps = useCollection<any>(query(collection(db, "corporates"), orderBy("company")));
  const [stage, setStage] = useState<string | null>(null);
  const [segment, setSegment] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ company: "", segment: "corporate", contactName: "", contactEmail: "", contactPhone: "" });
  const nav = useNavigate();

  const create = async () => {
    if (!f.company.trim()) return toastError({ message: "Company name is required." });
    try {
      const ref = await addDoc(collection(db, "corporates"), {
        company: f.company.trim(), segment: f.segment, stage: "lead", regNo: "", taxId: "", address: "", billingEmail: f.contactEmail.trim(),
        website: "", notes: "", nextFollowUpAt: null,
        contacts: f.contactName || f.contactEmail ? [{ name: f.contactName.trim(), email: f.contactEmail.trim(), phone: f.contactPhone.trim(), role: "" }] : [],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      logAudit("corporate.create", "corporates", ref.id, { company: f.company });
      nav(`/corporates/${ref.id}`);
    } catch (e) { toastError(e); }
  };

  const s = search.trim().toLowerCase();
  const rows = corps.data.filter((c) => (!stage || c.stage === stage) && (!segment || c.segment === segment)
    && (!s || [c.company, ...(c.contacts ?? []).map((x: any) => `${x.name} ${x.email}`)].some((v) => String(v).toLowerCase().includes(s))));
  const counts = Object.fromEntries(CORP_PIPELINE.map((p) => [p, corps.data.filter((c) => c.stage === p).length]));

  return (
    <>
      <PageHeader title="Corporate clients" subtitle="Bulk and custom-printed decks for companies, clubs, bars and events"
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>New corporate</Button>} />
      <Group mb="md" gap="xs">
        {CORP_PIPELINE.map((p) => (
          <Badge key={p} size="lg" variant={stage === p ? "filled" : "light"} style={{ cursor: "pointer" }} onClick={() => setStage(stage === p ? null : p)}>
            {label(p)} · {counts[p]}
          </Badge>
        ))}
      </Group>
      <Group mb="md">
        <TextInput placeholder="Search company or contact" leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={260} />
        <Select placeholder="All segments" clearable value={segment} onChange={setSegment} data={CORP_SEGMENTS.map((x) => ({ value: x, label: label(x) }))} w={160} />
      </Group>
      {corps.loading ? <Loading /> : !rows.length ? <Empty>No corporate clients yet.</Empty> : (
        <Table.ScrollContainer minWidth={760}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Company</Table.Th><Table.Th>Segment</Table.Th><Table.Th>Stage</Table.Th><Table.Th>Main contact</Table.Th><Table.Th ta="right">Samples</Table.Th><Table.Th>Next follow-up</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {rows.map((c) => {
                const due = c.nextFollowUpAt && c.nextFollowUpAt.toDate() <= new Date();
                return (
                  <Table.Tr key={c.id}>
                    <Table.Td><Anchor component={Link} to={`/corporates/${c.id}`} fw={600}>{c.company}</Anchor></Table.Td>
                    <Table.Td>{label(c.segment)}</Table.Td>
                    <Table.Td><StatusBadge status={c.stage} /></Table.Td>
                    <Table.Td><Text size="sm">{c.contacts?.[0]?.name}</Text><Text size="xs" c="dimmed">{c.contacts?.[0]?.email}</Text></Table.Td>
                    <Table.Td ta="right">{c.samplesSent ?? 0}</Table.Td>
                    <Table.Td><Text size="sm" c={due ? "red" : undefined} fw={due ? 600 : undefined}>{fmtDate(c.nextFollowUpAt)}</Text></Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={open} onClose={() => setOpen(false)} title="New corporate client">
        <Stack>
          <TextInput label="Company" required value={f.company} onChange={(e) => setF({ ...f, company: e.currentTarget.value })} />
          <Select label="Segment" value={f.segment} allowDeselect={false} onChange={(v) => setF({ ...f, segment: v! })} data={CORP_SEGMENTS.map((x) => ({ value: x, label: label(x) }))} />
          <TextInput label="Contact name" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.currentTarget.value })} />
          <Group grow>
            <TextInput label="Contact email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.currentTarget.value })} />
            <TextInput label="Phone" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.currentTarget.value })} />
          </Group>
          <Button onClick={create}>Create</Button>
        </Stack>
      </Modal>
    </>
  );
}
