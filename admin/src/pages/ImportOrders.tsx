import { useState } from "react";
import { Link } from "react-router";
import {
  Breadcrumbs, Anchor, Text, Paper, Stack, Select, Switch, Button, Table, Alert, Group, Code, List, Badge,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import Papa from "papaparse";
import { IconFileSpreadsheet, IconDownload } from "@tabler/icons-react";
import { PageHeader } from "../components/ui";
import { call, toastError } from "../lib/call";
import { label, SOURCES } from "../lib/format";
import { useLocations } from "./Inventory";

const COLUMNS = ["orderRef", "name", "email", "phone", "country", "address", "sku", "qty", "unitPrice", "shippingFee", "status", "orderDate"];
const REQUIRED = ["orderRef", "sku", "qty"];
// Common header names from Kickstarter / BackerKit / Shopee / Lazada exports → our columns.
const ALIASES: Record<string, string> = {
  "backer number": "orderRef", "backer id": "orderRef", "order id": "orderRef", "order no": "orderRef", "order number": "orderRef", "order item id": "orderRef", "order_id": "orderRef",
  "backer name": "name", "customer name": "name", "recipient name": "name", "receiver name": "name", "shipping name": "name", "name": "name",
  "email": "email", "backer email": "email", "customer email": "email",
  "phone": "phone", "phone number": "phone", "shipping phone number": "phone",
  "country": "country", "shipping country": "country", "shipping country name": "country",
  "address": "address", "shipping address": "address", "delivery address": "address",
  "sku": "sku", "seller sku": "sku", "sku reference no.": "sku", "reward sku": "sku",
  "qty": "qty", "quantity": "qty",
  "unit price": "unitPrice", "unitprice": "unitPrice", "price": "unitPrice", "deal price": "unitPrice", "pledge amount": "unitPrice",
  "shipping fee": "shippingFee", "shippingfee": "shippingFee", "shipping amount": "shippingFee",
  "status": "status", "order status": "status",
  "order date": "orderDate", "orderdate": "orderDate", "pledged at": "orderDate", "order creation date": "orderDate", "created at": "orderDate",
};

export default function ImportOrdersPage() {
  const { locations, defaultLocation } = useLocations();
  const [source, setSource] = useState("kickstarter");
  const [location, setLocation] = useState<string | null>(null);
  const [trackStock, setTrackStock] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapped, setMapped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const parse = (file: File) => {
    setResult(null);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        const map: Record<string, string> = {};
        headers.forEach((h) => {
          const key = h.trim().toLowerCase();
          const col = COLUMNS.find((c) => c.toLowerCase() === key) ?? ALIASES[key];
          if (col && !Object.values(map).includes(col)) map[h] = col;
        });
        const missing = REQUIRED.filter((c) => !Object.values(map).includes(c));
        if (missing.length) { toastError({ message: `Missing column(s): ${missing.join(", ")}. Use the template below.` }); return; }
        setMapped(map);
        setFileName(file.name);
        setRows((res.data as any[]).map((r) => Object.fromEntries(Object.entries(map).map(([h, c]) => [c, String(r[h] ?? "").trim()]))));
      },
      error: (e) => toastError(e),
    });
  };

  const run = async () => {
    setBusy(true);
    try {
      const out: any = { created: 0, skipped: 0, codesIssued: 0, errors: [] };
      for (let i = 0; i < rows.length; i += 500) {
        const r = await call<any>("importOrders", { source, rows: rows.slice(i, i + 500), trackStock, location: location ?? defaultLocation });
        out.created += r.created; out.skipped += r.skipped; out.codesIssued += r.codesIssued; out.errors.push(...r.errors);
      }
      setResult(out);
    } catch { /* toast */ } finally { setBusy(false); }
  };

  const template = () => {
    const csv = Papa.unparse([COLUMNS, ["KS-1001", "Jane Tan", "jane@example.com", "+60123456789", "MY", "1 Jalan Example, KL", "KC-CLASSIC-EN", "2", "79", "10", "paid", "2026-11-01"]]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "orders-import-template.csv";
    a.click();
  };

  return (
    <>
      <Breadcrumbs mb="xs"><Anchor component={Link} to="/orders" size="sm">Orders</Anchor><Text size="sm">Import</Text></Breadcrumbs>
      <PageHeader title="Import orders" subtitle="Kickstarter backer reports, Shopee and Lazada exports, or any spreadsheet in the template format"
        actions={<Button variant="light" leftSection={<IconDownload size={16} />} onClick={template}>Download template</Button>} />
      <Stack maw={1000}>
        <Paper withBorder p="md">
          <Group grow align="flex-end">
            <Select label="Channel" value={source} allowDeselect={false} onChange={(v) => setSource(v!)} data={SOURCES.filter((s) => s !== "corporate").map((s) => ({ value: s, label: label(s) }))} />
            <Select label="Ship from" value={location ?? defaultLocation} allowDeselect={false} onChange={setLocation} data={locations.map((l) => ({ value: l.id, label: l.name }))} />
            <Switch label="Update inventory" checked={trackStock} onChange={(e) => setTrackStock(e.currentTarget.checked)} mb={8} />
          </Group>
        </Paper>
        <Dropzone onDrop={(f) => f[0] && parse(f[0])} accept={["text/csv", "application/vnd.ms-excel"]} maxFiles={1}>
          <Group justify="center" mih={90} style={{ pointerEvents: "none" }}>
            <IconFileSpreadsheet size={36} stroke={1.4} />
            <div><Text fw={600}>Drop a CSV file</Text><Text size="sm" c="dimmed">From Excel or Google Sheets, use “Save as CSV”.</Text></div>
          </Group>
        </Dropzone>
        <Alert variant="light" title="How it works">
          <List size="sm">
            <List.Item>Rows with the same <Code>orderRef</Code> are combined into one order with several items.</List.Item>
            <List.Item>Importing the same file twice is safe, because orders that already exist are skipped.</List.Item>
            <List.Item>If <Code>status</Code> is empty, the order is imported as <b>paid</b>. Paid orders reserve stock, and shipped orders take it out of inventory.</List.Item>
            <List.Item>If a paid customer has an email address and no app code yet, a code is generated and emailed to them automatically.</List.Item>
            <List.Item>Shopee and Lazada exports often hide the buyer's email address. Add the emails to the file before importing, or issue the codes later from the customer's page.</List.Item>
          </List>
        </Alert>
        {rows.length > 0 && !result && (
          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>{fileName}: {rows.length} rows · {new Set(rows.map((r) => r.orderRef)).size} orders</Text>
              <Button onClick={run} loading={busy}>Import {rows.length} rows as {label(source)}</Button>
            </Group>
            <Text size="xs" c="dimmed" mb="xs">Columns found: {Object.entries(mapped).map(([h, c]) => (h === c ? c : `${h} → ${c}`)).join(", ")}</Text>
            <Table.ScrollContainer minWidth={900}>
              <Table striped>
                <Table.Thead><Table.Tr>{COLUMNS.map((c) => <Table.Th key={c}>{c}</Table.Th>)}</Table.Tr></Table.Thead>
                <Table.Tbody>
                  {rows.slice(0, 20).map((r, i) => <Table.Tr key={i}>{COLUMNS.map((c) => <Table.Td key={c}><Text size="xs">{r[c]}</Text></Table.Td>)}</Table.Tr>)}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {rows.length > 20 && <Text size="xs" c="dimmed">…and {rows.length - 20} more</Text>}
          </Paper>
        )}
        {result && (
          <Paper withBorder p="md">
            <Group mb="sm">
              <Badge color="green" size="lg">{result.created} created</Badge>
              <Badge color="gray" size="lg">{result.skipped} already imported</Badge>
              <Badge color="blue" size="lg">{result.codesIssued} codes emailed</Badge>
              <Badge color={result.errors.length ? "red" : "gray"} size="lg">{result.errors.length} failed</Badge>
            </Group>
            {result.errors.length > 0 && (
              <Table>
                <Table.Thead><Table.Tr><Table.Th>Order ref</Table.Th><Table.Th>CSV rows</Table.Th><Table.Th>Problem</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{result.errors.map((e: any) => <Table.Tr key={e.orderRef}><Table.Td>{e.orderRef}</Table.Td><Table.Td>{e.rows.join(", ")}</Table.Td><Table.Td><Text size="sm" c="red">{e.error}</Text></Table.Td></Table.Tr>)}</Table.Tbody>
              </Table>
            )}
            <Group mt="md"><Button component={Link} to="/orders">View orders</Button><Button variant="subtle" onClick={() => { setRows([]); setResult(null); }}>Import another file</Button></Group>
          </Paper>
        )}
      </Stack>
    </>
  );
}
