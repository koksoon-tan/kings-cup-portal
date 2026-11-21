import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import {
  Breadcrumbs, Anchor, Text, Group, Button, SimpleGrid, Paper, Table, NumberInput, Stack, TextInput, Switch, Modal, Badge, Select,
} from "@mantine/core";
import { doc, collection, query, where, orderBy, limit, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCollection, useDocument } from "../lib/hooks";
import { PageHeader, Loading, Field } from "../components/ui";
import { fmtDate, label, money, SOURCES } from "../lib/format";
import { AdjustStockModal } from "../components/AdjustStock";
import { useLocations } from "./Inventory";
import { call, toastError, toastOk } from "../lib/call";
import { logAudit } from "../lib/audit";

export default function InventoryDetailPage() {
  const { sku } = useParams();
  const item = useDocument<any>(doc(db, "inventory", sku!), [sku]);
  const [max, setMax] = useState(50);
  const moves = useCollection<any>(query(collection(db, "stockMovements"), where("sku", "==", sku), orderBy("at", "desc"), limit(max)), [sku, max]);
  const decks = useCollection<any>(collection(db, "decks"));
  const { locations, currency } = useLocations();
  const [adjust, setAdjust] = useState(false);
  const [take, setTake] = useState<Record<string, number> | null>(null);
  const [meta, setMeta] = useState<any>(null);

  useEffect(() => {
    if (item.data && !meta) setMeta({ name: item.data.name, lowStockThreshold: item.data.lowStockThreshold ?? 0, active: item.data.active !== false, deckId: item.data.deckId ?? null, allocation: { ...(item.data.allocation ?? {}) } });
  }, [item.data]);

  if (item.loading || !meta) return item.loading || item.data ? <Loading /> : <Text>SKU not found.</Text>;
  const i = item.data!;

  const saveMeta = async () => {
    try {
      const allocation = Object.fromEntries(Object.entries(meta.allocation).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
      await updateDoc(doc(db, "inventory", sku!), { ...meta, allocation, updatedAt: serverTimestamp() });
      logAudit("inventory.update", "inventory", sku!, { ...meta, allocation });
      toastOk("Saved");
    } catch (e) { toastError(e); }
  };

  const submitTake = async () => {
    try {
      const r = await call<{ diffs: Record<string, number> }>("stockTake", { sku, counts: take });
      const n = Object.keys(r.diffs).length;
      toastOk(n ? `Stock take posted: ${Object.entries(r.diffs).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ")}` : "Counts match — nothing to adjust.");
      setTake(null);
    } catch { /* toast */ }
  };

  return (
    <>
      <Breadcrumbs mb="xs"><Anchor component={Link} to="/inventory" size="sm">Inventory</Anchor><Text size="sm">{sku}</Text></Breadcrumbs>
      <PageHeader title={sku} subtitle={i.name}
        actions={<>
          <Button variant="light" onClick={() => setTake(Object.fromEntries(locations.map((l) => [l.id, i.byLocation?.[l.id] ?? 0])))}>Stock take</Button>
          <Button onClick={() => setAdjust(true)}>Adjust stock</Button>
        </>} />

      <SimpleGrid cols={{ base: 2, md: 5 }} mb="lg">
        <Paper withBorder p="sm"><Field label="On hand"><Text fw={700} size="xl">{i.onHand}</Text></Field></Paper>
        <Paper withBorder p="sm"><Field label="Reserved"><Text fw={700} size="xl">{i.reserved}</Text></Field></Paper>
        <Paper withBorder p="sm"><Field label="Available"><Text fw={700} size="xl" c={i.onHand - i.reserved <= (i.lowStockThreshold ?? 0) ? "red" : undefined}>{i.onHand - i.reserved}</Text></Field></Paper>
        <Paper withBorder p="sm"><Field label="Unit cost (avg)">{money(i.unitCost ?? 0, currency)}</Field></Paper>
        <Paper withBorder p="sm"><Field label="Stock value">{money((i.unitCost ?? 0) * i.onHand, currency)}</Field></Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} mb="lg">
        <Paper withBorder p="md">
          <Text fw={600} mb="sm">Channel allocation (limited run)</Text>
          <Text size="xs" c="dimmed" mb="sm">The most units each channel may sell. Leave it at 0 for no limit. Orders that go over the limit are blocked.</Text>
          <Table>
            <Table.Thead><Table.Tr><Table.Th>Channel</Table.Th><Table.Th ta="right">Sold</Table.Th><Table.Th ta="right">Reserved</Table.Th><Table.Th ta="right" w={130}>Allocation</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {SOURCES.map((s) => (
                <Table.Tr key={s}>
                  <Table.Td>{label(s)}</Table.Td>
                  <Table.Td ta="right">{i.soldByChannel?.[s] ?? 0}</Table.Td>
                  <Table.Td ta="right">{i.reservedByChannel?.[s] ?? 0}</Table.Td>
                  <Table.Td><NumberInput size="xs" min={0} value={meta.allocation[s] ?? 0} onChange={(v) => setMeta({ ...meta, allocation: { ...meta.allocation, [s]: Number(v) || 0 } })} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
        <Paper withBorder p="md">
          <Stack>
            <Text fw={600}>Details</Text>
            <TextInput label="Product name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.currentTarget.value })} />
            <Select label="Deck design" clearable searchable value={meta.deckId} onChange={(v) => setMeta({ ...meta, deckId: v })} data={decks.data.map((d) => ({ value: d.id, label: d.name }))} />
            <NumberInput label="Low-stock alert at" min={0} value={meta.lowStockThreshold} onChange={(v) => setMeta({ ...meta, lowStockThreshold: Number(v) || 0 })} />
            <Switch label="Active" checked={meta.active} onChange={(e) => setMeta({ ...meta, active: e.currentTarget.checked })} />
            <Text size="sm">By location: {locations.map((l) => `${l.name} ${i.byLocation?.[l.id] ?? 0}`).join(" · ")}</Text>
            <Group><Button onClick={saveMeta}>Save details</Button></Group>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="md">
        <Text fw={600} mb="sm">Stock movements</Text>
        <Table.ScrollContainer minWidth={800}>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>When</Table.Th><Table.Th>Type</Table.Th><Table.Th ta="right">On hand Δ</Table.Th><Table.Th ta="right">Reserved Δ</Table.Th><Table.Th>Location</Table.Th><Table.Th>Reference</Table.Th><Table.Th ta="right">After</Table.Th><Table.Th>By</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {moves.data.map((m) => (
                <Table.Tr key={m.id}>
                  <Table.Td><Text size="xs">{fmtDate(m.at, true)}</Text></Table.Td>
                  <Table.Td><Badge variant="light" size="sm">{label(m.type)}</Badge></Table.Td>
                  <Table.Td ta="right"><Text size="sm" c={m.qty > 0 ? "green" : m.qty < 0 ? "red" : "dimmed"}>{m.qty > 0 ? `+${m.qty}` : m.qty || (m.transferQty ? `⇄ ${m.transferQty}` : "")}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="sm" c="dimmed">{m.reservedDelta ? (m.reservedDelta > 0 ? `+${m.reservedDelta}` : m.reservedDelta) : ""}</Text></Table.Td>
                  <Table.Td><Text size="sm">{m.location}{m.toLocation ? ` → ${m.toLocation}` : ""}</Text></Table.Td>
                  <Table.Td>
                    {m.orderId && <Anchor component={Link} to={`/orders/${m.orderId}`} size="sm">Order</Anchor>}
                    {m.corporateId && <Anchor component={Link} to={`/corporates/${m.corporateId}`} size="sm"> Corporate</Anchor>}
                    {m.poNumber && <Text size="sm">PO {m.poNumber}</Text>}
                    {m.note && <Text size="xs" c="dimmed">{m.note}</Text>}
                  </Table.Td>
                  <Table.Td ta="right"><Text size="sm">{m.onHandAfter}</Text></Table.Td>
                  <Table.Td><Text size="xs">{m.by?.email}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {moves.data.length >= max && <Button variant="subtle" mt="sm" onClick={() => setMax(max + 100)}>Load more</Button>}
      </Paper>

      <AdjustStockModal sku={adjust ? sku! : null} onClose={() => setAdjust(false)} />
      <Modal opened={!!take} onClose={() => setTake(null)} title="Stock take — enter physical counts">
        {take && (
          <Stack>
            {locations.map((l) => (
              <NumberInput key={l.id} label={`${l.name} (system: ${i.byLocation?.[l.id] ?? 0})`} min={0} value={take[l.id]} onChange={(v) => setTake({ ...take, [l.id]: Number(v) || 0 })} />
            ))}
            <Text size="xs" c="dimmed">Any differences are saved as stock take adjustments.</Text>
            <Button onClick={submitTake}>Post counts</Button>
          </Stack>
        )}
      </Modal>
    </>
  );
}
