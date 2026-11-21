import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  Button, Table, Anchor, Group, Select, TextInput, Text, Badge, Modal, Stack, NumberInput, Textarea, ActionIcon, Switch, SimpleGrid,
} from "@mantine/core";
import { collection, query, where, orderBy, limit, QueryConstraint } from "firebase/firestore";
import { IconPlus, IconUpload, IconTrash, IconSearch } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/hooks";
import { PageHeader, StatusBadge, Empty, Loading } from "../components/ui";
import { fmtDate, money, label, SOURCES, ORDER_STATUSES } from "../lib/format";
import { call } from "../lib/call";
import { useLocations } from "./Inventory";

function CreateOrderModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const inv = useCollection<any>(collection(db, "inventory"));
  const { locations, defaultLocation, currency } = useLocations();
  const nav = useNavigate();
  const blank = () => ({
    source: "website", sourceRef: "", status: "paid", name: "", email: "", phone: "", country: "", address: "",
    shippingFee: 0, location: defaultLocation, trackStock: true, notes: "", items: [{ sku: "", qty: 1, unitPrice: 0 }],
  });
  const [f, setF] = useState<any>(blank);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await call<{ orderId: string }>("createOrder", {
        source: f.source, sourceRef: f.sourceRef, status: f.status, shippingFee: f.shippingFee, currency,
        address: f.address, location: f.location, trackStock: f.trackStock, notes: f.notes,
        customer: { name: f.name, email: f.email, phone: f.phone, country: f.country },
        items: f.items,
      }, "Order created");
      setF(blank());
      onClose();
      nav(`/orders/${r.orderId}`);
    } catch { /* toast */ } finally { setBusy(false); }
  };
  const setItem = (i: number, patch: any) => setF({ ...f, items: f.items.map((it: any, j: number) => (j === i ? { ...it, ...patch } : it)) });

  return (
    <Modal opened={opened} onClose={onClose} title="New order" size="lg">
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select label="Channel" value={f.source} allowDeselect={false} onChange={(v) => setF({ ...f, source: v })} data={SOURCES.map((s) => ({ value: s, label: label(s) }))} />
          <TextInput label="External order no." value={f.sourceRef} onChange={(e) => setF({ ...f, sourceRef: e.currentTarget.value })} />
          <Select label="Status" value={f.status} allowDeselect={false} onChange={(v) => setF({ ...f, status: v })} data={["pending", "paid", "shipped"].map((s) => ({ value: s, label: label(s) }))} />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Customer name" value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
          <TextInput label="Email" description="The app code is sent here" value={f.email} onChange={(e) => setF({ ...f, email: e.currentTarget.value })} />
          <TextInput label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.currentTarget.value })} />
          <TextInput label="Country" value={f.country} onChange={(e) => setF({ ...f, country: e.currentTarget.value })} />
        </SimpleGrid>
        <Textarea label="Shipping address" autosize value={f.address} onChange={(e) => setF({ ...f, address: e.currentTarget.value })} />
        <Text fw={600} size="sm">Items</Text>
        {f.items.map((it: any, i: number) => (
          <Group key={i} align="flex-end" wrap="nowrap">
            <Select label={i === 0 ? "SKU" : undefined} style={{ flex: 2 }} searchable value={it.sku} onChange={(v) => setItem(i, { sku: v })}
              data={inv.data.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: `${s.id} — ${s.name} (${s.onHand - s.reserved} avail.)` }))} />
            <NumberInput label={i === 0 ? "Qty" : undefined} w={80} min={1} value={it.qty} onChange={(v) => setItem(i, { qty: Number(v) || 1 })} />
            <NumberInput label={i === 0 ? "Unit price" : undefined} w={110} min={0} decimalScale={2} value={it.unitPrice} onChange={(v) => setItem(i, { unitPrice: Number(v) || 0 })} />
            <ActionIcon variant="subtle" color="red" mb={4} disabled={f.items.length === 1} onClick={() => setF({ ...f, items: f.items.filter((_: any, j: number) => j !== i) })}><IconTrash size={16} /></ActionIcon>
          </Group>
        ))}
        <Group><Button variant="subtle" size="xs" onClick={() => setF({ ...f, items: [...f.items, { sku: "", qty: 1, unitPrice: 0 }] })}>+ Add item</Button></Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <NumberInput label="Shipping fee" min={0} decimalScale={2} value={f.shippingFee} onChange={(v) => setF({ ...f, shippingFee: Number(v) || 0 })} />
          <Select label="Ship from" value={f.location} allowDeselect={false} onChange={(v) => setF({ ...f, location: v })} data={locations.map((l) => ({ value: l.id, label: l.name }))} />
        </SimpleGrid>
        <Switch label="Update inventory for this order" checked={f.trackStock} onChange={(e) => setF({ ...f, trackStock: e.currentTarget.checked })} />
        <Textarea label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.currentTarget.value })} />
        <Text size="xs" c="dimmed">If the order is paid and the customer has no app code yet, one is generated and emailed automatically (you can turn this off in Settings).</Text>
        <Button onClick={submit} loading={busy}>Create order</Button>
      </Stack>
    </Modal>
  );
}

export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const source = params.get("source") ?? "";
  const [search, setSearch] = useState("");
  const [max, setMax] = useState(100);
  const [open, setOpen] = useState(false);

  const cons: QueryConstraint[] = [];
  if (status) cons.push(where("status", "==", status));
  if (source) cons.push(where("source", "==", source));
  cons.push(orderBy("createdAt", "desc"), limit(max));
  const orders = useCollection<any>(
    status && source ? query(collection(db, "orders"), where("status", "==", status), orderBy("createdAt", "desc"), limit(max)) : query(collection(db, "orders"), ...cons),
    [status, source, max]);

  const s = search.trim().toLowerCase();
  const rows = orders.data
    .filter((o) => !(status && source) || o.source === source)
    .filter((o) => !s || [o.orderNo, o.sourceRef, o.customer?.name, o.customer?.email].some((v) => String(v ?? "").toLowerCase().includes(s)));
  const setParam = (k: string, v: string | null) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p); };

  return (
    <>
      <PageHeader title="Orders" subtitle="Every channel in one place. Changing status reserves or deducts stock and sends app codes."
        actions={<>
          <Button variant="light" component={Link} to="/orders/import" leftSection={<IconUpload size={16} />}>Import CSV</Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>New order</Button>
        </>} />
      <Group mb="md">
        <TextInput placeholder="Search order no., name, email" leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={280} />
        <Select placeholder="All statuses" clearable value={status || null} onChange={(v) => setParam("status", v)} data={ORDER_STATUSES.map((x) => ({ value: x, label: label(x) }))} w={160} />
        <Select placeholder="All channels" clearable value={source || null} onChange={(v) => setParam("source", v)} data={SOURCES.map((x) => ({ value: x, label: label(x) }))} w={160} />
      </Group>
      {orders.loading ? <Loading /> : !rows.length ? <Empty>No orders found.</Empty> : (
        <Table.ScrollContainer minWidth={820}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Order</Table.Th><Table.Th>Date</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Channel</Table.Th><Table.Th>Items</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th>Status</Table.Th><Table.Th>Tracking</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {rows.map((o) => (
                <Table.Tr key={o.id}>
                  <Table.Td><Anchor component={Link} to={`/orders/${o.id}`} fw={600}>{o.orderNo}</Anchor>{o.sourceRef && <Text size="xs" c="dimmed">{o.sourceRef}</Text>}</Table.Td>
                  <Table.Td><Text size="sm">{fmtDate(o.orderDate ?? o.createdAt)}</Text></Table.Td>
                  <Table.Td><Text size="sm">{o.customer?.name}</Text><Text size="xs" c="dimmed">{o.customer?.email}</Text></Table.Td>
                  <Table.Td><Badge variant="outline" size="sm">{o.source}</Badge></Table.Td>
                  <Table.Td><Text size="sm">{o.items?.map((i: any) => `${i.qty}× ${i.sku}`).join(", ")}</Text></Table.Td>
                  <Table.Td ta="right">{money(o.total, o.currency)}</Table.Td>
                  <Table.Td><StatusBadge status={o.status} /></Table.Td>
                  <Table.Td><Text size="xs">{o.shipping?.courier} {o.shipping?.trackingNo}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {orders.data.length >= max && <Button variant="subtle" mt="sm" onClick={() => setMax(max + 100)}>Load more</Button>}
      <CreateOrderModal opened={open} onClose={() => setOpen(false)} />
    </>
  );
}
