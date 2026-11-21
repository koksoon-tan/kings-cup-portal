import { useEffect, useState } from "react";
import { Link } from "react-router";
import { SimpleGrid, Paper, Text, Group, Table, Stack, Title, Anchor, Progress, Badge } from "@mantine/core";
import {
  collection, query, where, getCountFromServer, getAggregateFromServer, sum, orderBy, limit, Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { canAccess } from "../lib/roles";
import { useCollection } from "../lib/hooks";
import { PageHeader, StatusBadge } from "../components/ui";
import { fmtAgo, fmtDate, money, label, SOURCES } from "../lib/format";

function Stat({ label: l, value, hint, to }: { label: string; value: React.ReactNode; hint?: React.ReactNode; to?: string }) {
  const body = (
    <Paper withBorder p="md" h="100%">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{l}</Text>
      <Text fw={700} size="xl" mt={4}>{value}</Text>
      {hint && <Text size="xs" c="dimmed" mt={2} component="div">{hint}</Text>}
    </Paper>
  );
  return to ? <Anchor component={Link} to={to} underline="never" c="inherit">{body}</Anchor> : body;
}

const count = async (q: ReturnType<typeof query>) => (await getCountFromServer(q)).data().count;

export default function HomePage() {
  const { role } = useAuth();
  const [codes, setCodes] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<Record<string, number>>({});
  const [sales, setSales] = useState<Record<string, number>>({});

  const showCodes = canAccess(role, "codes");
  const showOrders = canAccess(role, "orders");
  const showInv = canAccess(role, "inventory");
  const showCorp = canAccess(role, "corporates");

  useEffect(() => {
    if (showCodes) {
      Promise.all(["generated", "sent", "redeemed", "revoked", "expired"].map(async (s) =>
        [s, await count(query(collection(db, "serialCodes"), where("status", "==", s)))] as const,
      )).then((r) => setCodes(Object.fromEntries(r))).catch(console.error);
    }
    if (showOrders) {
      Promise.all(["pending", "paid", "packing", "shipped"].map(async (s) =>
        [s, await count(query(collection(db, "orders"), where("status", "==", s)))] as const,
      )).then((r) => setOrders(Object.fromEntries(r))).catch(console.error);
      Promise.all(SOURCES.map(async (s) => {
        const agg = await getAggregateFromServer(
          query(collection(db, "orders"), where("source", "==", s), where("status", "in", ["paid", "packing", "shipped", "delivered", "completed"])),
          { total: sum("total") },
        );
        return [s, agg.data().total ?? 0] as const;
      })).then((r) => setSales(Object.fromEntries(r))).catch(console.error);
    }
  }, [showCodes, showOrders]);

  const inventory = useCollection<any>(showInv ? collection(db, "inventory") : null, [showInv]);
  const recentOrders = useCollection<any>(
    showOrders ? query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(8)) : null, [showOrders]);
  const followUps = useCollection<any>(
    showCorp ? query(collection(db, "corporates"), where("nextFollowUpAt", "<=", Timestamp.now()), orderBy("nextFollowUpAt"), limit(8)) : null,
    [showCorp]);

  const lowStock = inventory.data.filter((i) => i.active !== false && (i.onHand - i.reserved) <= (i.lowStockThreshold ?? 0));
  const issued = (codes.generated ?? 0) + (codes.sent ?? 0) + (codes.redeemed ?? 0);
  const redeemRate = issued ? Math.round(((codes.redeemed ?? 0) / issued) * 100) : 0;
  const totalSales = Object.values(sales).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Today at a glance" />
      <SimpleGrid cols={{ base: 2, md: 4 }} mb="lg">
        {showOrders && <Stat label="To fulfil" value={(orders.paid ?? 0) + (orders.packing ?? 0)} hint={`${orders.pending ?? 0} awaiting payment`} to="/orders?status=paid" />}
        {showOrders && <Stat label="In transit" value={orders.shipped ?? 0} to="/orders?status=shipped" />}
        {showCodes && <Stat label="Codes redeemed" value={`${codes.redeemed ?? 0} / ${issued}`} hint={<Progress value={redeemRate} size="sm" mt={6} />} to="/codes" />}
        {showCodes && <Stat label="Codes waiting" value={(codes.generated ?? 0) + (codes.sent ?? 0)} hint={`${codes.generated ?? 0} not emailed yet`} to="/codes?status=generated" />}
        {showInv && <Stat label="Low stock SKUs" value={<Text span c={lowStock.length ? "red" : undefined} inherit>{lowStock.length}</Text>} to="/inventory" />}
        {showInv && <Stat label="Units available" value={inventory.data.reduce((a, i) => a + (i.onHand - i.reserved), 0).toLocaleString()} hint={`${inventory.data.reduce((a, i) => a + i.reserved, 0)} reserved`} to="/inventory" />}
        {showOrders && <Stat label="Paid sales" value={money(totalSales)} hint="All channels, all time" />}
        {showCorp && <Stat label="Follow-ups due" value={followUps.data.length} to="/corporates" />}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        {showOrders && (
          <Paper withBorder p="md">
            <Title order={5} mb="sm">Sales by channel</Title>
            <Stack gap="xs">
              {SOURCES.map((s) => (
                <div key={s}>
                  <Group justify="space-between"><Text size="sm">{label(s)}</Text><Text size="sm" fw={600}>{money(sales[s] ?? 0)}</Text></Group>
                  <Progress value={totalSales ? ((sales[s] ?? 0) / totalSales) * 100 : 0} size="sm" />
                </div>
              ))}
            </Stack>
          </Paper>
        )}
        {showOrders && (
          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm"><Title order={5}>Recent orders</Title><Anchor component={Link} to="/orders" size="sm">All orders</Anchor></Group>
            <Table.ScrollContainer minWidth={400}>
              <Table verticalSpacing={6}>
                <Table.Tbody>
                  {recentOrders.data.map((o) => (
                    <Table.Tr key={o.id}>
                      <Table.Td><Anchor component={Link} to={`/orders/${o.id}`} size="sm">{o.orderNo}</Anchor></Table.Td>
                      <Table.Td><Text size="sm" lineClamp={1}>{o.customer?.name || o.customer?.email}</Text></Table.Td>
                      <Table.Td><Badge variant="outline" size="sm">{o.source}</Badge></Table.Td>
                      <Table.Td><StatusBadge status={o.status} /></Table.Td>
                      <Table.Td><Text size="xs" c="dimmed">{fmtAgo(o.createdAt)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!recentOrders.data.length && <Text c="dimmed" size="sm">No orders yet.</Text>}
          </Paper>
        )}
        {showInv && lowStock.length > 0 && (
          <Paper withBorder p="md">
            <Title order={5} mb="sm">Low stock</Title>
            <Table>
              <Table.Thead><Table.Tr><Table.Th>SKU</Table.Th><Table.Th ta="right">Available</Table.Th><Table.Th ta="right">Alert at</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {lowStock.map((i) => (
                  <Table.Tr key={i.id}>
                    <Table.Td><Anchor component={Link} to={`/inventory/${i.id}`} size="sm">{i.id}</Anchor> <Text span size="xs" c="dimmed">{i.name}</Text></Table.Td>
                    <Table.Td ta="right"><Text c="red" fw={600} size="sm">{i.onHand - i.reserved}</Text></Table.Td>
                    <Table.Td ta="right">{i.lowStockThreshold ?? 0}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
        {showCorp && followUps.data.length > 0 && (
          <Paper withBorder p="md">
            <Title order={5} mb="sm">Corporate follow-ups due</Title>
            <Stack gap={6}>
              {followUps.data.map((c) => (
                <Group key={c.id} justify="space-between">
                  <Anchor component={Link} to={`/corporates/${c.id}`} size="sm">{c.company}</Anchor>
                  <Group gap="xs"><StatusBadge status={c.stage} /><Text size="xs" c="dimmed">{fmtDate(c.nextFollowUpAt)}</Text></Group>
                </Group>
              ))}
            </Stack>
          </Paper>
        )}
      </SimpleGrid>
    </>
  );
}
