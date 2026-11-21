import { useState } from "react";
import { Link } from "react-router";
import { Button, Table, Anchor, Modal, Stack, TextInput, Select, NumberInput, Text, Badge, Group, Switch } from "@mantine/core";
import { collection, doc, getDoc, setDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { IconPlus } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useCollection, useDocument } from "../lib/hooks";
import { PageHeader, Empty, Loading } from "../components/ui";
import { money } from "../lib/format";
import { logAudit } from "../lib/audit";
import { toastError, toastOk } from "../lib/call";
import { AdjustStockModal } from "../components/AdjustStock";

export function useLocations() {
  const s = useDocument<any>(doc(db, "settings", "general"));
  const locations: { id: string; name: string }[] = s.data?.locations ?? [{ id: "main", name: "Main warehouse" }];
  return { locations, defaultLocation: s.data?.defaultLocation ?? "main", currency: s.data?.currency ?? "MYR" };
}

export default function InventoryPage() {
  const inv = useCollection<any>(query(collection(db, "inventory"), orderBy("name")));
  const decks = useCollection<any>(collection(db, "decks"));
  const corporates = useCollection<any>(collection(db, "corporates"));
  const { locations, currency } = useLocations();
  const [open, setOpen] = useState(false);
  const [adjust, setAdjust] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState({ sku: "", name: "", deckId: "", kind: "retail", corporateId: "", lowStockThreshold: 50, unitCost: 0 });

  const create = async () => {
    const sku = form.sku.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-");
    if (!sku || !form.name.trim()) return toastError({ message: "SKU and name are required." });
    try {
      const ref = doc(db, "inventory", sku);
      if ((await getDoc(ref)).exists()) return toastError({ message: `SKU ${sku} already exists.` });
      await setDoc(ref, {
        name: form.name.trim(),
        deckId: form.deckId || null,
        kind: form.kind,
        corporateId: form.kind === "corporate" ? form.corporateId || null : null,
        lowStockThreshold: form.lowStockThreshold,
        allocation: {},
        onHand: 0,
        reserved: 0,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      logAudit("inventory.create", "inventory", sku, { name: form.name });
      toastOk(`SKU ${sku} created — record a stock-in when the print run arrives.`);
      setOpen(false);
      setForm({ sku: "", name: "", deckId: "", kind: "retail", corporateId: "", lowStockThreshold: 50, unitCost: 0 });
    } catch (e) { toastError(e); }
  };

  const rows = inv.data.filter((i) => showInactive || i.active !== false);
  const totals = rows.reduce((a, i) => ({ onHand: a.onHand + i.onHand, reserved: a.reserved + i.reserved, value: a.value + i.onHand * (i.unitCost ?? 0) }), { onHand: 0, reserved: 0, value: 0 });

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Physical card stock per SKU and location. Orders reserve and deduct stock automatically."
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>New SKU</Button>}
      />
      <Group mb="md" justify="space-between">
        <Group gap="xl">
          <Text size="sm">On hand <b>{totals.onHand.toLocaleString()}</b></Text>
          <Text size="sm">Reserved <b>{totals.reserved.toLocaleString()}</b></Text>
          <Text size="sm">Stock value <b>{money(totals.value, currency)}</b></Text>
        </Group>
        <Switch label="Show inactive" checked={showInactive} onChange={(e) => setShowInactive(e.currentTarget.checked)} />
      </Group>
      {inv.loading ? <Loading /> : !rows.length ? <Empty>No SKUs yet. Create one for each deck you print.</Empty> : (
        <Table.ScrollContainer minWidth={800}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>SKU</Table.Th><Table.Th>Type</Table.Th>
                {locations.map((l) => <Table.Th key={l.id} ta="right">{l.name}</Table.Th>)}
                <Table.Th ta="right">On hand</Table.Th><Table.Th ta="right">Reserved</Table.Th><Table.Th ta="right">Available</Table.Th><Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((i) => {
                const avail = i.onHand - i.reserved;
                const low = avail <= (i.lowStockThreshold ?? 0);
                return (
                  <Table.Tr key={i.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/inventory/${i.id}`} fw={600}>{i.id}</Anchor>
                      <Text size="xs" c="dimmed">{i.name}{i.active === false ? " · inactive" : ""}</Text>
                    </Table.Td>
                    <Table.Td><Badge variant="outline" size="sm">{i.kind}</Badge></Table.Td>
                    {locations.map((l) => <Table.Td key={l.id} ta="right">{i.byLocation?.[l.id] ?? 0}</Table.Td>)}
                    <Table.Td ta="right">{i.onHand}</Table.Td>
                    <Table.Td ta="right">{i.reserved}</Table.Td>
                    <Table.Td ta="right"><Text fw={700} c={low ? "red" : undefined} size="sm">{avail}</Text>{low && <Badge color="red" size="xs">Low</Badge>}</Table.Td>
                    <Table.Td ta="right"><Button size="xs" variant="light" onClick={() => setAdjust(i.id)}>Adjust</Button></Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <AdjustStockModal sku={adjust} onClose={() => setAdjust(null)} />

      <Modal opened={open} onClose={() => setOpen(false)} title="New SKU">
        <Stack>
          <TextInput label="SKU" description="Letters, numbers, dashes. Can't be changed later." placeholder="KC-CLASSIC-EN" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.currentTarget.value })} />
          <TextInput label="Product name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          <Select label="Deck design" clearable searchable value={form.deckId} onChange={(v) => setForm({ ...form, deckId: v ?? "" })} data={decks.data.map((d) => ({ value: d.id, label: d.name }))} />
          <Select label="Type" value={form.kind} allowDeselect={false} onChange={(v) => setForm({ ...form, kind: v ?? "retail" })}
            data={[{ value: "retail", label: "Retail deck" }, { value: "corporate", label: "Corporate custom run" }, { value: "sample", label: "Sample / promo deck" }]} />
          {form.kind === "corporate" && (
            <Select label="Corporate client" searchable value={form.corporateId} onChange={(v) => setForm({ ...form, corporateId: v ?? "" })} data={corporates.data.map((c) => ({ value: c.id, label: c.company }))} />
          )}
          <NumberInput label="Low-stock alert at" description="Alert when available units drop to this number" min={0} value={form.lowStockThreshold} onChange={(v) => setForm({ ...form, lowStockThreshold: Number(v) || 0 })} />
          <Button onClick={create}>Create SKU</Button>
        </Stack>
      </Modal>
    </>
  );
}
