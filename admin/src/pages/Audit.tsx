import { useState } from "react";
import { Table, Text, Select, Group, Button, Code } from "@mantine/core";
import { collection, query, orderBy, limit, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/hooks";
import { PageHeader, Loading } from "../components/ui";
import { fmtDate } from "../lib/format";

const ENTITIES = ["decks", "inventory", "orders", "customers", "serialCodes", "corporates", "corporateOrders", "invoices", "settings", "staff"];

export default function AuditPage() {
  const [entity, setEntity] = useState<string | null>(null);
  const [max, setMax] = useState(100);
  const logs = useCollection<any>(
    entity ? query(collection(db, "auditLogs"), where("entity", "==", entity), orderBy("at", "desc"), limit(max))
      : query(collection(db, "auditLogs"), orderBy("at", "desc"), limit(max)),
    [entity, max]);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who changed what, and when" />
      <Group mb="md"><Select placeholder="All areas" clearable value={entity} onChange={setEntity} data={ENTITIES} w={200} /></Group>
      {logs.loading ? <Loading /> : (
        <Table.ScrollContainer minWidth={760}>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>When</Table.Th><Table.Th>Who</Table.Th><Table.Th>Action</Table.Th><Table.Th>Record</Table.Th><Table.Th>Details</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {logs.data.map((l) => (
                <Table.Tr key={l.id}>
                  <Table.Td><Text size="xs">{fmtDate(l.at, true)}</Text></Table.Td>
                  <Table.Td><Text size="xs">{l.by?.email}</Text></Table.Td>
                  <Table.Td><Code>{l.action}</Code></Table.Td>
                  <Table.Td><Text size="xs">{l.entity}/{l.entityId?.slice(0, 16)}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed" lineClamp={2}>{l.details && Object.keys(l.details).length ? JSON.stringify(l.details) : ""}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {logs.data.length >= max && <Button variant="subtle" mt="sm" onClick={() => setMax(max + 100)}>Load more</Button>}
    </>
  );
}
