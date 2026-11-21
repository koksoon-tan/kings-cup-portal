import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import {
  Breadcrumbs, Anchor, Text, Group, Button, SimpleGrid, Paper, Table, Stack, TextInput, Textarea, Select, Tabs, Modal, NumberInput,
  ActionIcon, Badge,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { doc, collection, query, where, orderBy, updateDoc, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useCollection, useDocument } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { canAccess } from "../lib/roles";
import { PageHeader, Loading, StatusBadge } from "../components/ui";
import { fmtDate, money, label, toDate, CORP_PIPELINE, CORP_SEGMENTS, SAMPLE_TYPES } from "../lib/format";
import { call, toastError, toastOk } from "../lib/call";
import { logAudit } from "../lib/audit";
import { useLocations } from "./Inventory";

function SamplesTab({ corpId }: { corpId: string }) {
  const samples = useCollection<any>(query(collection(db, "corporates", corpId, "samples"), orderBy("sentAt", "desc")), [corpId]);
  const inv = useCollection<any>(collection(db, "inventory"));
  const { locations, defaultLocation } = useLocations();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ sampleType: "generic_logo", qty: 1, sku: null, location: null, followUpAt: null, notes: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await call("recordSample", { corporateId: corpId, ...f, location: f.location ?? defaultLocation, followUpAt: f.followUpAt ? new Date(f.followUpAt).toISOString() : null }, "Sample recorded");
      setOpen(false);
      setF({ sampleType: "generic_logo", qty: 1, sku: null, location: null, followUpAt: null, notes: "" });
    } catch { /* toast */ } finally { setBusy(false); }
  };
  const setOutcome = async (s: any, outcome: string | null) => {
    try { await updateDoc(doc(db, "corporates", corpId, "samples", s.id), { outcome }); logAudit("sample.outcome", "corporates", corpId, { sampleId: s.id, outcome }); }
    catch (e) { toastError(e); }
  };

  return (
    <>
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">Samples taken from a SKU are deducted from inventory automatically.</Text>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setOpen(true)}>Record sample</Button>
      </Group>
      {!samples.data.length ? <Text c="dimmed" size="sm">No samples sent yet.</Text> : (
        <Table.ScrollContainer minWidth={760}>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Sent</Table.Th><Table.Th>Type</Table.Th><Table.Th ta="right">Qty</Table.Th><Table.Th>SKU</Table.Th><Table.Th>Follow up</Table.Th><Table.Th>Outcome</Table.Th><Table.Th>Notes</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {samples.data.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td><Text size="sm">{fmtDate(s.sentAt)}</Text><Text size="xs" c="dimmed">{s.by?.email}</Text></Table.Td>
                  <Table.Td><Text size="sm">{SAMPLE_TYPES[s.sampleType] ?? s.sampleType}</Text></Table.Td>
                  <Table.Td ta="right">{s.qty}</Table.Td>
                  <Table.Td>{s.sku ? <Anchor component={Link} to={`/inventory/${s.sku}`} size="sm">{s.sku}</Anchor> : "—"}</Table.Td>
                  <Table.Td><Text size="sm">{fmtDate(s.followUpAt)}</Text></Table.Td>
                  <Table.Td><Select size="xs" w={130} value={s.outcome} onChange={(v) => setOutcome(s, v)} data={["pending", "interested", "ordered", "declined"].map((x) => ({ value: x, label: label(x) }))} /></Table.Td>
                  <Table.Td><Text size="xs">{s.notes}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={open} onClose={() => setOpen(false)} title="Record sample sent">
        <Stack>
          <Select label="Sample type" value={f.sampleType} allowDeselect={false} onChange={(v) => setF({ ...f, sampleType: v })} data={Object.entries(SAMPLE_TYPES).map(([value, l]) => ({ value, label: l }))} />
          <NumberInput label="Quantity" min={1} value={f.qty} onChange={(v) => setF({ ...f, qty: Number(v) || 1 })} />
          <Select label="Take from SKU (deducts stock)" clearable searchable value={f.sku} onChange={(v) => setF({ ...f, sku: v })}
            data={inv.data.map((s) => ({ value: s.id, label: `${s.id} — ${s.name} (${s.onHand - s.reserved} avail.)` }))} />
          {f.sku && <Select label="Location" value={f.location ?? defaultLocation} allowDeselect={false} onChange={(v) => setF({ ...f, location: v })} data={locations.map((l) => ({ value: l.id, label: l.name }))} />}
          <DateInput label="Follow up on" clearable value={f.followUpAt} onChange={(v) => setF({ ...f, followUpAt: v })} minDate={new Date()} />
          <Textarea label="Notes / hook" placeholder="e.g. Sent generic deck with their logo mock-up; offered 10% off 500+ units" value={f.notes} onChange={(e) => setF({ ...f, notes: e.currentTarget.value })} />
          <Button onClick={submit} loading={busy}>Save</Button>
        </Stack>
      </Modal>
    </>
  );
}

function OrdersTab({ corp }: { corp: any }) {
  const orders = useCollection<any>(query(collection(db, "corporateOrders"), where("corporateId", "==", corp.id), orderBy("createdAt", "desc")), [corp.id]);
  const { currency } = useLocations();
  const nav = useNavigate();
  const create = async () => {
    try {
      const ref = await addDoc(collection(db, "corporateOrders"), {
        corporateId: corp.id, corporateName: corp.company, title: `${corp.company} custom deck`, qty: 100, unitPrice: 0, currency,
        deckId: null, sku: null, designFiles: [], stage: "quote", notes: "",
        shipping: { address: corp.address ?? "", courier: "", trackingNo: "" },
        timeline: [{ stage: "quote", at: Timestamp.now(), by: "", note: "Created" }],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      logAudit("corporateOrder.create", "corporateOrders", ref.id, { corporateId: corp.id });
      nav(`/corporate-orders/${ref.id}`);
    } catch (e) { toastError(e); }
  };
  return (
    <>
      <Group justify="flex-end" mb="sm"><Button size="xs" leftSection={<IconPlus size={14} />} onClick={create}>New corporate order</Button></Group>
      {!orders.data.length ? <Text c="dimmed" size="sm">No orders yet.</Text> : (
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Order</Table.Th><Table.Th ta="right">Qty</Table.Th><Table.Th ta="right">Value</Table.Th><Table.Th>Proof</Table.Th><Table.Th>Stage</Table.Th><Table.Th>Created</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {orders.data.map((o) => (
              <Table.Tr key={o.id}>
                <Table.Td><Anchor component={Link} to={`/corporate-orders/${o.id}`} size="sm" fw={600}>{o.title}</Anchor></Table.Td>
                <Table.Td ta="right">{o.qty}</Table.Td>
                <Table.Td ta="right">{money(o.qty * o.unitPrice, o.currency)}</Table.Td>
                <Table.Td>{o.proof ? <StatusBadge status={o.proof.status === "pending" ? "awaiting_approval" : o.proof.status} /> : "—"}</Table.Td>
                <Table.Td><StatusBadge status={o.stage} /></Table.Td>
                <Table.Td><Text size="sm">{fmtDate(o.createdAt)}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}

export function InvoicesTab({ corpId, corporateOrderId, defaults }: { corpId: string; corporateOrderId?: string; defaults?: any }) {
  const { role } = useAuth();
  const invoices = useCollection<any>(
    canAccess(role, "invoices") || canAccess(role, "corporates") ? query(collection(db, "invoices"), where("corporateId", "==", corpId), orderBy("createdAt", "desc")) : null,
    [corpId]);
  const { currency } = useLocations();
  const company = useDocument<any>(doc(db, "settings", "company"));
  const nav = useNavigate();
  const create = async (type: string) => {
    try {
      const ref = await addDoc(collection(db, "invoices"), {
        corporateId: corpId, corporateOrderId: corporateOrderId ?? null, type, status: "draft", currency,
        lineItems: defaults?.lineItems?.(type) ?? [{ description: "", qty: 1, unitPrice: 0 }],
        taxRate: company.data?.taxRate ?? 0, taxLabel: company.data?.taxLabel ?? "Tax",
        issueDate: Timestamp.now(), dueDate: Timestamp.fromDate(new Date(Date.now() + (company.data?.paymentTermsDays ?? 14) * 86400_000)),
        notes: "", createdAt: serverTimestamp(),
      });
      logAudit("invoice.createDraft", "invoices", ref.id, { type });
      nav(`/invoices/${ref.id}`);
    } catch (e) { toastError(e); }
  };
  const list = invoices.data.filter((i) => !corporateOrderId || i.corporateOrderId === corporateOrderId);
  return (
    <>
      {canAccess(role, "invoices") && (
        <Group justify="flex-end" mb="sm" gap="xs">
          <Button size="xs" variant="light" onClick={() => create("quote")}>New quote</Button>
          <Button size="xs" variant="light" onClick={() => create("deposit")}>Deposit invoice</Button>
          <Button size="xs" variant="light" onClick={() => create("balance")}>Balance invoice</Button>
          <Button size="xs" onClick={() => create("full")}>Full invoice</Button>
        </Group>
      )}
      {!list.length ? <Text c="dimmed" size="sm">No quotes or invoices yet.</Text> : (
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>No.</Table.Th><Table.Th>Type</Table.Th><Table.Th>Date</Table.Th><Table.Th>Due</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th ta="right">Paid</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {list.map((i) => (
              <Table.Tr key={i.id}>
                <Table.Td><Anchor component={Link} to={`/invoices/${i.id}`} size="sm" fw={600}>{i.invoiceNo ?? "Draft"}</Anchor></Table.Td>
                <Table.Td><Badge variant="outline" size="sm">{i.type}</Badge></Table.Td>
                <Table.Td><Text size="sm">{fmtDate(i.issueDate)}</Text></Table.Td>
                <Table.Td><Text size="sm" c={i.status === "issued" && toDate(i.dueDate)! < new Date() ? "red" : undefined}>{fmtDate(i.dueDate)}</Text></Table.Td>
                <Table.Td ta="right">{i.total != null ? money(i.total, i.currency) : "—"}</Table.Td>
                <Table.Td ta="right">{money(i.amountPaid ?? 0)}</Table.Td>
                <Table.Td><StatusBadge status={i.status} /></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}

export default function CorporateDetailPage() {
  const { id } = useParams();
  const corp = useDocument<any>(doc(db, "corporates", id!), [id]);
  const [f, setF] = useState<any>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (corp.data && !dirty) setF({
      company: corp.data.company ?? "", segment: corp.data.segment ?? "corporate", stage: corp.data.stage ?? "lead", regNo: corp.data.regNo ?? "",
      taxId: corp.data.taxId ?? "", address: corp.data.address ?? "", billingEmail: corp.data.billingEmail ?? "", website: corp.data.website ?? "",
      notes: corp.data.notes ?? "", nextFollowUpAt: toDate(corp.data.nextFollowUpAt), contacts: corp.data.contacts ?? [],
    });
  }, [corp.data]);

  if (corp.loading || !f) return corp.loading || corp.data ? <Loading /> : <Text>Not found.</Text>;
  const set = (p: any) => { setF({ ...f, ...p }); setDirty(true); };
  const save = async () => {
    try {
      await updateDoc(doc(db, "corporates", id!), { ...f, nextFollowUpAt: f.nextFollowUpAt ? Timestamp.fromDate(new Date(f.nextFollowUpAt)) : null, updatedAt: serverTimestamp() });
      logAudit("corporate.update", "corporates", id!, { stage: f.stage });
      setDirty(false);
      toastOk("Saved");
    } catch (e) { toastError(e); }
  };
  const setContact = (i: number, p: any) => set({ contacts: f.contacts.map((c: any, j: number) => (i === j ? { ...c, ...p } : c)) });

  return (
    <>
      <Breadcrumbs mb="xs"><Anchor component={Link} to="/corporates" size="sm">Corporate</Anchor><Text size="sm">{corp.data!.company}</Text></Breadcrumbs>
      <PageHeader title={<Group gap="sm">{corp.data!.company}<StatusBadge status={corp.data!.stage} size="md" /></Group>}
        subtitle={`${label(corp.data!.segment)} · ${corp.data!.samplesSent ?? 0} sample decks sent`}
        actions={<Button onClick={save} disabled={!dirty}>{dirty ? "Save changes" : "Saved"}</Button>} />
      <Tabs defaultValue="profile" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="profile">Profile</Tabs.Tab>
          <Tabs.Tab value="samples">Samples</Tabs.Tab>
          <Tabs.Tab value="orders">Orders</Tabs.Tab>
          <Tabs.Tab value="invoices">Quotes &amp; invoices</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="profile">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Paper withBorder p="md">
              <Stack>
                <TextInput label="Company" value={f.company} onChange={(e) => set({ company: e.currentTarget.value })} />
                <Group grow>
                  <Select label="Segment" value={f.segment} allowDeselect={false} onChange={(v) => set({ segment: v })} data={CORP_SEGMENTS.map((x) => ({ value: x, label: label(x) }))} />
                  <Select label="Pipeline stage" value={f.stage} allowDeselect={false} onChange={(v) => set({ stage: v })} data={CORP_PIPELINE.map((x) => ({ value: x, label: label(x) }))} />
                </Group>
                <DateInput label="Next follow-up" clearable value={f.nextFollowUpAt} onChange={(v) => set({ nextFollowUpAt: v })} />
                <Group grow>
                  <TextInput label="Company reg. no." value={f.regNo} onChange={(e) => set({ regNo: e.currentTarget.value })} />
                  <TextInput label="Tax ID / TIN" value={f.taxId} onChange={(e) => set({ taxId: e.currentTarget.value })} />
                </Group>
                <Textarea label="Billing address" autosize value={f.address} onChange={(e) => set({ address: e.currentTarget.value })} />
                <Group grow>
                  <TextInput label="Billing email" value={f.billingEmail} onChange={(e) => set({ billingEmail: e.currentTarget.value })} />
                  <TextInput label="Website" value={f.website} onChange={(e) => set({ website: e.currentTarget.value })} />
                </Group>
                <Textarea label="Notes" autosize minRows={3} value={f.notes} onChange={(e) => set({ notes: e.currentTarget.value })} />
              </Stack>
            </Paper>
            <Paper withBorder p="md">
              <Group justify="space-between" mb="sm"><Text fw={600}>Contacts</Text>
                <Button size="xs" variant="light" onClick={() => set({ contacts: [...f.contacts, { name: "", email: "", phone: "", role: "" }] })}>+ Add contact</Button></Group>
              <Stack>
                {f.contacts.map((c: any, i: number) => (
                  <Paper key={i} withBorder p="xs">
                    <Group grow mb={6}>
                      <TextInput size="xs" placeholder="Name" value={c.name} onChange={(e) => setContact(i, { name: e.currentTarget.value })} />
                      <TextInput size="xs" placeholder="Role" value={c.role} onChange={(e) => setContact(i, { role: e.currentTarget.value })} />
                    </Group>
                    <Group grow wrap="nowrap">
                      <TextInput size="xs" placeholder="Email" value={c.email} onChange={(e) => setContact(i, { email: e.currentTarget.value })} />
                      <TextInput size="xs" placeholder="Phone" value={c.phone} onChange={(e) => setContact(i, { phone: e.currentTarget.value })} />
                      <ActionIcon variant="subtle" color="red" style={{ flex: "0 0 auto" }} onClick={() => set({ contacts: f.contacts.filter((_: any, j: number) => j !== i) })}><IconTrash size={14} /></ActionIcon>
                    </Group>
                  </Paper>
                ))}
                {!f.contacts.length && <Text size="sm" c="dimmed">No contacts.</Text>}
              </Stack>
            </Paper>
          </SimpleGrid>
        </Tabs.Panel>
        <Tabs.Panel value="samples"><SamplesTab corpId={id!} /></Tabs.Panel>
        <Tabs.Panel value="orders"><OrdersTab corp={corp.data!} /></Tabs.Panel>
        <Tabs.Panel value="invoices"><InvoicesTab corpId={id!} /></Tabs.Panel>
      </Tabs>
    </>
  );
}
