import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import {
  Breadcrumbs, Anchor, Text, Group, Button, SimpleGrid, Paper, Table, Stack, TextInput, Textarea, Modal, Timeline, Badge,
} from "@mantine/core";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useDocument } from "../lib/hooks";
import { PageHeader, Loading, Field, StatusBadge } from "../components/ui";
import { fmtDate, money, label, ORDER_TRANSITIONS } from "../lib/format";
import { call, toastError, toastOk } from "../lib/call";
import { logAudit } from "../lib/audit";

const STOCK_HINT: Record<string, string> = {
  paid: "Reserves the stock.",
  packing: "Reserves the stock if it isn't reserved yet.",
  shipped: "Takes the stock out of inventory.",
  delivered: "Takes the stock out of inventory if that hasn't happened yet.",
  completed: "Takes the stock out of inventory if that hasn't happened yet.",
  cancelled: "Releases any reserved stock.",
  refunded: "Releases reserved stock. If the order has shipped, use Returned once the goods come back.",
  returned: "Adds the units back to stock.",
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const order = useDocument<any>(doc(db, "orders", id!), [id]);
  const customer = useDocument<any>(order.data?.customerId ? doc(db, "customers", order.data.customerId) : null, [order.data?.customerId]);
  const [target, setTarget] = useState<string | null>(null);
  const [t, setT] = useState({ note: "", courier: "", trackingNo: "" });
  const [busy, setBusy] = useState(false);
  const [ship, setShip] = useState<any>(null);

  useEffect(() => {
    if (order.data) setShip({ address: order.data.shipping?.address ?? "", courier: order.data.shipping?.courier ?? "", trackingNo: order.data.shipping?.trackingNo ?? "", notes: order.data.notes ?? "" });
  }, [order.data?.updatedAt?.seconds]);

  if (order.loading || !ship) return order.loading || order.data ? <Loading /> : <Text>Order not found.</Text>;
  const o = order.data!;

  const move = async () => {
    setBusy(true);
    try {
      await call("updateOrderStatus", { orderId: id, status: target, ...t }, `Order marked ${target}`);
      setTarget(null);
      setT({ note: "", courier: "", trackingNo: "" });
    } catch { /* toast */ } finally { setBusy(false); }
  };

  const saveShipping = async () => {
    try {
      await updateDoc(doc(db, "orders", id!), {
        shipping: { ...o.shipping, address: ship.address, courier: ship.courier, trackingNo: ship.trackingNo },
        notes: ship.notes, updatedAt: serverTimestamp(),
      });
      logAudit("order.edit", "orders", id!, { courier: ship.courier, trackingNo: ship.trackingNo });
      toastOk("Saved");
    } catch (e) { toastError(e); }
  };

  return (
    <>
      <Breadcrumbs mb="xs"><Anchor component={Link} to="/orders" size="sm">Orders</Anchor><Text size="sm">{o.orderNo}</Text></Breadcrumbs>
      <PageHeader title={<Group gap="sm">{o.orderNo}<StatusBadge status={o.status} size="md" /></Group>}
        subtitle={`${label(o.source)}${o.sourceRef ? ` · ${o.sourceRef}` : ""} · ${fmtDate(o.orderDate ?? o.createdAt, true)}`}
        actions={ORDER_TRANSITIONS[o.status]?.map((s) => (
          <Button key={s} variant={["cancelled", "refunded", "returned"].includes(s) ? "light" : "filled"} color={["cancelled", "refunded", "returned"].includes(s) ? "red" : undefined}
            onClick={() => { setT({ note: "", courier: o.shipping?.courier ?? "", trackingNo: o.shipping?.trackingNo ?? "" }); setTarget(s); }}>
            Mark {label(s).toLowerCase()}
          </Button>
        ))} />

      <SimpleGrid cols={{ base: 1, md: 3 }} mb="lg">
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Field label="Customer">{customer.data ? <Anchor component={Link} to={`/customers/${o.customerId}`}>{o.customer?.name || o.customer?.email}</Anchor> : o.customer?.name}</Field>
            <Field label="Email">{o.customer?.email}</Field>
            <Field label="Phone">{o.customer?.phone}</Field>
            <Field label="App code">{customer.data ? <StatusBadge status={customer.data.codeStatus} /> : "—"}</Field>
          </Stack>
        </Paper>
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Field label="Stock">{o.trackStock ? <Badge variant="light">{label(o.stockState)}</Badge> : "Not tracked"}</Field>
            <Field label="Ships from">{o.fulfilmentLocation}</Field>
            <Field label="Shipped">{fmtDate(o.shipping?.shippedAt, true)}</Field>
          </Stack>
        </Paper>
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Field label="Subtotal">{money(o.subtotal, o.currency)}</Field>
            <Field label="Shipping">{money(o.shippingFee, o.currency)}</Field>
            <Field label="Total"><Text fw={700}>{money(o.total, o.currency)}</Text></Field>
          </Stack>
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Stack>
          <Paper withBorder p="md">
            <Text fw={600} mb="sm">Items</Text>
            <Table>
              <Table.Thead><Table.Tr><Table.Th>SKU</Table.Th><Table.Th>Product</Table.Th><Table.Th ta="right">Qty</Table.Th><Table.Th ta="right">Unit</Table.Th><Table.Th ta="right">Amount</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {o.items.map((it: any, i: number) => (
                  <Table.Tr key={i}>
                    <Table.Td><Anchor component={Link} to={`/inventory/${it.sku}`} size="sm">{it.sku}</Anchor></Table.Td>
                    <Table.Td>{it.name}</Table.Td>
                    <Table.Td ta="right">{it.qty}</Table.Td>
                    <Table.Td ta="right">{money(it.unitPrice)}</Table.Td>
                    <Table.Td ta="right">{money(it.qty * it.unitPrice)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
          <Paper withBorder p="md">
            <Stack>
              <Text fw={600}>Shipping</Text>
              <Textarea label="Address" autosize value={ship.address} onChange={(e) => setShip({ ...ship, address: e.currentTarget.value })} />
              <Group grow>
                <TextInput label="Courier" value={ship.courier} onChange={(e) => setShip({ ...ship, courier: e.currentTarget.value })} />
                <TextInput label="Tracking no." value={ship.trackingNo} onChange={(e) => setShip({ ...ship, trackingNo: e.currentTarget.value })} />
              </Group>
              <Textarea label="Internal notes" autosize value={ship.notes} onChange={(e) => setShip({ ...ship, notes: e.currentTarget.value })} />
              <Group><Button variant="light" onClick={saveShipping}>Save</Button></Group>
            </Stack>
          </Paper>
        </Stack>
        <Paper withBorder p="md">
          <Text fw={600} mb="md">Timeline</Text>
          <Timeline active={o.timeline?.length} bulletSize={14} lineWidth={2}>
            {[...(o.timeline ?? [])].reverse().map((e: any, i: number) => (
              <Timeline.Item key={i} title={label(e.status)}>
                <Text size="xs" c="dimmed">{fmtDate(e.at, true)} · {e.by}</Text>
                {e.note && <Text size="sm">{e.note}</Text>}
              </Timeline.Item>
            ))}
          </Timeline>
        </Paper>
      </SimpleGrid>

      <Modal opened={!!target} onClose={() => setTarget(null)} title={`Mark order ${target}`}>
        <Stack>
          {o.trackStock && target && <Text size="sm">{STOCK_HINT[target]}</Text>}
          {target === "shipped" && (
            <Group grow>
              <TextInput label="Courier" value={t.courier} onChange={(e) => setT({ ...t, courier: e.currentTarget.value })} />
              <TextInput label="Tracking no." value={t.trackingNo} onChange={(e) => setT({ ...t, trackingNo: e.currentTarget.value })} />
            </Group>
          )}
          <Textarea label="Note (optional)" value={t.note} onChange={(e) => setT({ ...t, note: e.currentTarget.value })} />
          <Button onClick={move} loading={busy}>Confirm</Button>
        </Stack>
      </Modal>
    </>
  );
}
