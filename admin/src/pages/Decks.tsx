import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Table, Anchor, Modal, Stack, TextInput, Select, Group, Text, NumberInput, SegmentedControl, Badge } from "@mantine/core";
import { collection, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { IconPlus } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/hooks";
import { PageHeader, StatusBadge, Empty, Loading } from "../components/ui";
import { DEFAULT_STYLE, DEFAULT_EFFECTS } from "../lib/cards";
import { fmtDate, label } from "../lib/format";
import { logAudit } from "../lib/audit";
import { toastError } from "../lib/call";

export default function DecksPage() {
  const decks = useCollection<any>(query(collection(db, "decks"), orderBy("createdAt", "desc")));
  const corporates = useCollection<any>(collection(db, "corporates"));
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", type: "inhouse", corporateId: "", designerName: "", designerEmail: "", royaltyPct: 10 });
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const create = async () => {
    if (!form.name.trim()) return toastError({ message: "Give the deck a name." });
    if (form.type === "corporate" && !form.corporateId) return toastError({ message: "Pick the corporate client." });
    setBusy(true);
    try {
      const ref = await addDoc(collection(db, "decks"), {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        corporateId: form.type === "corporate" ? form.corporateId : null,
        designer: form.type === "external"
          ? { name: form.designerName.trim(), email: form.designerEmail.trim(), royaltyPct: form.royaltyPct }
          : null,
        status: "draft",
        languages: ["en"],
        defaultLanguage: "en",
        countries: [],
        appAccess: "purchase",
        appPrice: 0,
        expiryDate: null,
        description: "",
        actions: {},
        cardOverrides: {},
        effects: DEFAULT_EFFECTS,
        textStyle: DEFAULT_STYLE,
        upload: { status: "none", errors: [], warnings: [] },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      logAudit("deck.create", "decks", ref.id, { name: form.name });
      nav(`/decks/${ref.id}`);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  const corpName = (id: string) => corporates.data.find((c) => c.id === id)?.company ?? "—";
  const rows = decks.data.filter((d) => filter === "all" || d.type === filter);

  return (
    <>
      <PageHeader
        title="Deck designs"
        subtitle="Card art, action text and fonts for each deck — in-house, corporate and external designer decks"
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>New deck</Button>}
      />
      <SegmentedControl mb="md" value={filter} onChange={setFilter}
        data={[{ value: "all", label: "All" }, { value: "inhouse", label: "In-house" }, { value: "corporate", label: "Corporate" }, { value: "external", label: "External designer" }]} />
      {decks.loading ? <Loading /> : !rows.length ? <Empty>No decks yet. Create one to upload its card art.</Empty> : (
        <Table.ScrollContainer minWidth={700}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>Deck</Table.Th><Table.Th>Type</Table.Th><Table.Th>Status</Table.Th><Table.Th>Card art</Table.Th><Table.Th>Languages</Table.Th><Table.Th>App</Table.Th><Table.Th>Updated</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/decks/${d.id}`} fw={600}>{d.name}</Anchor>
                    {d.code && <Text size="xs" c="dimmed">{d.code}</Text>}
                  </Table.Td>
                  <Table.Td>
                    {label(d.type)}
                    {d.type === "corporate" && <Text size="xs" c="dimmed">{corpName(d.corporateId)}</Text>}
                    {d.type === "external" && <Text size="xs" c="dimmed">{d.designer?.name} · {d.designer?.royaltyPct}%</Text>}
                  </Table.Td>
                  <Table.Td><StatusBadge status={d.status} /></Table.Td>
                  <Table.Td>{d.cards ? <Badge color="green" variant="light">{Object.keys(d.cards ?? {}).length} cards · v{d.artVersion}</Badge> : <StatusBadge status={d.upload?.status} />}</Table.Td>
                  <Table.Td>{(d.languages ?? []).join(", ").toUpperCase()}</Table.Td>
                  <Table.Td>{label(d.appAccess)}</Table.Td>
                  <Table.Td><Text size="sm">{fmtDate(d.updatedAt)}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="New deck">
        <Stack>
          <TextInput label="Deck name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          <TextInput label="Deck code" description="Short code used on SKUs, e.g. CLASSIC-01" value={form.code} onChange={(e) => setForm({ ...form, code: e.currentTarget.value })} />
          <Select label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v ?? "inhouse" })} allowDeselect={false}
            data={[{ value: "inhouse", label: "In-house design" }, { value: "corporate", label: "Corporate (B2B) design" }, { value: "external", label: "External designer (royalties)" }]} />
          {form.type === "corporate" && (
            <Select label="Corporate client" searchable value={form.corporateId} onChange={(v) => setForm({ ...form, corporateId: v ?? "" })}
              data={corporates.data.map((c) => ({ value: c.id, label: c.company }))} nothingFoundMessage="Add the corporate first" />
          )}
          {form.type === "external" && (
            <Group grow>
              <TextInput label="Designer name" value={form.designerName} onChange={(e) => setForm({ ...form, designerName: e.currentTarget.value })} />
              <NumberInput label="Royalty %" min={0} max={100} value={form.royaltyPct} onChange={(v) => setForm({ ...form, royaltyPct: Number(v) || 0 })} />
            </Group>
          )}
          {form.type === "external" && <TextInput label="Designer email" value={form.designerEmail} onChange={(e) => setForm({ ...form, designerEmail: e.currentTarget.value })} />}
          <Button onClick={create} loading={busy}>Create deck</Button>
        </Stack>
      </Modal>
    </>
  );
}
