import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import {
  Breadcrumbs, Anchor, Text, Group, Button, Paper, Stack, TextInput, Textarea, NumberInput, Table, ActionIcon, SimpleGrid, Modal, Alert,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { IconTrash, IconDownload } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useDocument, storageUrl } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { canAccess } from "../lib/roles";
import { PageHeader, Loading, StatusBadge, Field } from "../components/ui";
import { fmtDate, money, label, toDate } from "../lib/format";
import { call, toastError, toastOk } from "../lib/call";
import { logAudit } from "../lib/audit";
import { askConfirm, askText } from "../lib/confirm";

export default function InvoicePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { role } = useAuth();
  const inv = useDocument<any>(doc(db, "invoices", id!), [id]);
  const corp = useDocument<any>(inv.data ? doc(db, "corporates", inv.data.corporateId) : null, [inv.data?.corporateId]);
  const [f, setF] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState<any>(null);

  useEffect(() => {
    if (inv.data && !dirty) setF({
      lineItems: inv.data.lineItems ?? [], taxRate: inv.data.taxRate ?? 0, taxLabel: inv.data.taxLabel ?? "Tax",
      issueDate: toDate(inv.data.issueDate), dueDate: toDate(inv.data.dueDate), notes: inv.data.notes ?? "",
    });
  }, [inv.data]);

  if (inv.loading || !f) return inv.loading || inv.data ? <Loading /> : <Text>Not found.</Text>;
  const i = inv.data!;
  const draft = i.status === "draft";
  const editable = draft && canAccess(role, "invoices");
  const subtotal = f.lineItems.reduce((s: number, li: any) => s + (li.qty || 0) * (li.unitPrice || 0), 0);
  const tax = Math.round(subtotal * (f.taxRate || 0)) / 100;
  const set = (p: any) => { setF({ ...f, ...p }); setDirty(true); };
  const setLine = (n: number, p: any) => set({ lineItems: f.lineItems.map((li: any, j: number) => (j === n ? { ...li, ...p } : li)) });

  const save = async () => {
    await updateDoc(doc(db, "invoices", id!), {
      ...f, issueDate: f.issueDate ? Timestamp.fromDate(new Date(f.issueDate)) : Timestamp.now(),
      dueDate: f.dueDate ? Timestamp.fromDate(new Date(f.dueDate)) : null,
    });
    setDirty(false);
  };
  const issue = async () => {
    setBusy(true);
    try {
      await save();
      const r = await call<any>("issueInvoice", { invoiceId: id }, "Issued");
      toastOk(`${r.invoiceNo} issued — PDF ready`);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const download = async () => { if (i.pdfPath) window.open(await storageUrl(i.pdfPath), "_blank"); };
  const record = async () => {
    setBusy(true);
    try { await call("markInvoicePaid", { invoiceId: id, ...pay, paidAt: pay.paidAt ? new Date(pay.paidAt).toISOString() : null }, "Payment recorded"); setPay(null); }
    catch { /* toast */ } finally { setBusy(false); }
  };
  const voidIt = async () => {
    const reason = await askText("Void invoice", "Why are you voiding this invoice?");
    if (reason) await call("voidInvoice", { invoiceId: id, reason }, "Invoice voided").catch(() => undefined);
  };
  const title = i.invoiceNo ?? `Draft ${label(i.type)} ${i.type === "quote" ? "" : "invoice"}`;

  return (
    <>
      <Breadcrumbs mb="xs">
        <Anchor component={Link} to="/corporates" size="sm">Corporate</Anchor>
        <Anchor component={Link} to={`/corporates/${i.corporateId}`} size="sm">{corp.data?.company ?? "…"}</Anchor>
        {i.corporateOrderId && <Anchor component={Link} to={`/corporate-orders/${i.corporateOrderId}`} size="sm">Order</Anchor>}
        <Text size="sm">{title}</Text>
      </Breadcrumbs>
      <PageHeader title={<Group gap="sm">{title}<StatusBadge status={i.status} size="md" /></Group>} subtitle={`${label(i.type)} · ${corp.data?.company ?? ""}`}
        actions={<>
          {editable && <Button variant="subtle" color="red" onClick={async () => { if (await askConfirm("Delete this draft?", "Delete draft")) { await deleteDoc(doc(db, "invoices", id!)); logAudit("invoice.deleteDraft", "invoices", id!); nav(-1); } }}>Delete draft</Button>}
          {editable && dirty && <Button variant="light" onClick={() => save().then(() => toastOk("Draft saved")).catch(toastError)}>Save draft</Button>}
          {editable && <Button onClick={issue} loading={busy}>Issue &amp; create PDF</Button>}
          {i.pdfPath && <Button variant="light" leftSection={<IconDownload size={16} />} onClick={download}>PDF</Button>}
          {["issued", "partially_paid"].includes(i.status) && i.type !== "quote" && canAccess(role, "invoices") &&
            <Button onClick={() => setPay({ amount: Math.round((i.total - (i.amountPaid ?? 0)) * 100) / 100, reference: "", paidAt: new Date() })}>Record payment</Button>}
          {["issued", "partially_paid"].includes(i.status) && canAccess(role, "invoices") && <Button variant="subtle" color="red" onClick={voidIt}>Void</Button>}
        </>} />

      {draft && !corp.data?.address && <Alert color="yellow" mb="md">This corporate has no billing address yet. Add it on their profile before issuing.</Alert>}

      <Paper withBorder p="md" mb="md">
        <Table.ScrollContainer minWidth={600}>
          <Table>
            <Table.Thead><Table.Tr><Table.Th>Description</Table.Th><Table.Th w={100} ta="right">Qty</Table.Th><Table.Th w={140} ta="right">Unit price</Table.Th><Table.Th w={130} ta="right">Amount</Table.Th>{editable && <Table.Th w={40} />}</Table.Tr></Table.Thead>
            <Table.Tbody>
              {f.lineItems.map((li: any, n: number) => (
                <Table.Tr key={n}>
                  <Table.Td>{editable ? <Textarea autosize minRows={1} value={li.description} onChange={(e) => setLine(n, { description: e.currentTarget.value })} /> : li.description}</Table.Td>
                  <Table.Td ta="right">{editable ? <NumberInput min={0} value={li.qty} onChange={(v) => setLine(n, { qty: Number(v) || 0 })} /> : li.qty}</Table.Td>
                  <Table.Td ta="right">{editable ? <NumberInput min={0} decimalScale={2} value={li.unitPrice} onChange={(v) => setLine(n, { unitPrice: Number(v) || 0 })} /> : money(li.unitPrice)}</Table.Td>
                  <Table.Td ta="right">{money((li.qty || 0) * (li.unitPrice || 0))}</Table.Td>
                  {editable && <Table.Td><ActionIcon variant="subtle" color="red" onClick={() => set({ lineItems: f.lineItems.filter((_: any, j: number) => j !== n) })}><IconTrash size={14} /></ActionIcon></Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {editable && <Button size="xs" variant="subtle" mt="xs" onClick={() => set({ lineItems: [...f.lineItems, { description: "", qty: 1, unitPrice: 0 }] })}>+ Add line</Button>}
        <Stack gap={4} align="flex-end" mt="md">
          <Text size="sm">Subtotal: <b>{money(i.subtotal ?? subtotal, i.currency)}</b></Text>
          {(f.taxRate > 0) && <Text size="sm">{f.taxLabel} ({f.taxRate}%): <b>{money(i.tax ?? tax, i.currency)}</b></Text>}
          <Text size="lg" fw={700}>Total: {money(i.total ?? subtotal + tax, i.currency)}</Text>
          {i.amountPaid > 0 && <Text size="sm" c="green">Paid: {money(i.amountPaid, i.currency)} · Balance: {money(i.total - i.amountPaid, i.currency)}</Text>}
        </Stack>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md">
          <Stack>
            <Group grow>
              <DateInput label="Issue date" value={f.issueDate} onChange={(v) => set({ issueDate: v })} disabled={!editable} />
              <DateInput label={i.type === "quote" ? "Valid until" : "Due date"} value={f.dueDate} onChange={(v) => set({ dueDate: v })} disabled={!editable} clearable />
            </Group>
            <Group grow>
              <TextInput label="Tax label" value={f.taxLabel} onChange={(e) => set({ taxLabel: e.currentTarget.value })} disabled={!editable} />
              <NumberInput label="Tax rate %" min={0} max={100} decimalScale={2} value={f.taxRate} onChange={(v) => set({ taxRate: Number(v) || 0 })} disabled={!editable} />
            </Group>
            <Textarea label="Notes on the PDF" autosize value={f.notes} onChange={(e) => set({ notes: e.currentTarget.value })} disabled={!editable} />
          </Stack>
        </Paper>
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Field label="Bill to">{corp.data?.company}<br />{corp.data?.address}</Field>
            <Field label="Issued">{i.issuedAt ? `${fmtDate(i.issuedAt, true)} by ${i.issuedBy}` : "Not yet"}</Field>
            {i.voidReason && <Field label="Voided">{i.voidReason}</Field>}
            {(i.payments ?? []).length > 0 && (
              <Field label="Payments">
                {i.payments.map((p: any, n: number) => <div key={n}>{fmtDate(p.at)} · {money(p.amount, i.currency)} {p.reference && `· ${p.reference}`} <Text span size="xs" c="dimmed">({p.by})</Text></div>)}
              </Field>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      <Modal opened={!!pay} onClose={() => setPay(null)} title="Record payment">
        {pay && <Stack>
          <NumberInput label="Amount" min={0} decimalScale={2} value={pay.amount} onChange={(v) => setPay({ ...pay, amount: Number(v) || 0 })} />
          <TextInput label="Reference" placeholder="Bank transfer ref." value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.currentTarget.value })} />
          <DateInput label="Paid on" value={pay.paidAt} onChange={(v) => setPay({ ...pay, paidAt: v })} />
          <Button onClick={record} loading={busy}>Save payment</Button>
        </Stack>}
      </Modal>
    </>
  );
}
