import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import {
  Breadcrumbs, Anchor, Text, Group, Button, SimpleGrid, Paper, Stack, TextInput, Textarea, Select, NumberInput, Modal, Timeline,
  Alert, Checkbox, FileButton, Table, ActionIcon, Stepper,
} from "@mantine/core";
import { doc, collection, updateDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { ref as sref, uploadBytes } from "firebase/storage";
import { IconUpload, IconDownload, IconTrash } from "@tabler/icons-react";
import { db, storage } from "../lib/firebase";
import { useCollection, useDocument, storageUrl } from "../lib/hooks";
import { PageHeader, Loading, StatusBadge, Field } from "../components/ui";
import { fmtDate, money, label, CORP_ORDER_STAGES } from "../lib/format";
import { call, toastError, toastOk } from "../lib/call";
import { logAudit } from "../lib/audit";
import { InvoicesTab } from "./CorporateDetail";
import { useLocations } from "./Inventory";
import { useNavigate } from "react-router";

const FLOW = CORP_ORDER_STAGES.filter((s) => s !== "cancelled");
const HINT: Record<string, string> = {
  quote: "Send the client a quote.",
  design: "Collect or prepare the client's design files.",
  proof: "Upload the proof and get the client's approval.",
  deposit: "Issue the deposit invoice.",
  production: "Send the files to the printer.",
  ready: "The print run has arrived. Record the stock-in on the SKU.",
  shipped: "Ship the order to the client.",
  completed: "Collect the balance payment and close the order.",
};

async function open(path: string) {
  window.open(await storageUrl(path), "_blank");
}

export default function CorporateOrderPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const order = useDocument<any>(doc(db, "corporateOrders", id!), [id]);
  const decks = useCollection<any>(collection(db, "decks"));
  const inv = useCollection<any>(collection(db, "inventory"));
  const { locations, defaultLocation } = useLocations();
  const [f, setF] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [sf, setSf] = useState<any>({ note: "", deductStock: true, location: null, courier: "", trackingNo: "" });
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [dec, setDec] = useState({ approvedBy: "", notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order.data && !dirty) setF({
      title: order.data.title, qty: order.data.qty, unitPrice: order.data.unitPrice, deckId: order.data.deckId, sku: order.data.sku,
      notes: order.data.notes ?? "", shipping: order.data.shipping ?? { address: "", courier: "", trackingNo: "" },
    });
  }, [order.data]);

  if (order.loading || !f) return order.loading || order.data ? <Loading /> : <Text>Not found.</Text>;
  const o = order.data!;
  const set = (p: any) => { setF({ ...f, ...p }); setDirty(true); };
  const save = async () => {
    try { await updateDoc(doc(db, "corporateOrders", id!), { ...f, updatedAt: serverTimestamp() }); logAudit("corporateOrder.update", "corporateOrders", id!, { qty: f.qty }); setDirty(false); toastOk("Saved"); }
    catch (e) { toastError(e); }
  };

  const upload = async (file: File | null, kind: "design" | "proof") => {
    if (!file) return;
    try {
      const path = `corporates/${o.corporateId}/${kind}s/${id}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
      await uploadBytes(sref(storage, path), file);
      if (kind === "design") {
        await updateDoc(doc(db, "corporateOrders", id!), { designFiles: [...(o.designFiles ?? []), { name: file.name, path, at: new Date().toISOString() }], updatedAt: serverTimestamp() });
      } else {
        await updateDoc(doc(db, "corporateOrders", id!), { proof: { name: file.name, path, status: "pending", uploadedAt: new Date().toISOString() }, updatedAt: serverTimestamp() });
      }
      logAudit(`corporateOrder.upload.${kind}`, "corporateOrders", id!, { path });
      toastOk(kind === "proof" ? "Proof uploaded — record the client's decision when it comes back." : "Design file uploaded");
    } catch (e) { toastError(e); }
  };
  const removeDesign = async (i: number) => {
    try { await updateDoc(doc(db, "corporateOrders", id!), { designFiles: o.designFiles.filter((_: any, j: number) => j !== i) }); }
    catch (e) { toastError(e); }
  };

  const moveStage = async () => {
    setBusy(true);
    try {
      await call("updateCorporateOrderStage", { corporateOrderId: id, stage, ...sf, location: sf.location ?? defaultLocation }, `Moved to ${stage}`);
      setStage(null);
    } catch { /* toast */ } finally { setBusy(false); }
  };
  const decide = async () => {
    setBusy(true);
    try { await call("recordProofDecision", { corporateOrderId: id, decision, ...dec }, `Proof ${decision}`); setDecision(null); }
    catch { /* toast */ } finally { setBusy(false); }
  };

  const idx = FLOW.indexOf(o.stage);
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  const closed = ["completed", "cancelled"].includes(o.stage);
  const total = (f.qty || 0) * (f.unitPrice || 0);

  return (
    <>
      <Breadcrumbs mb="xs">
        <Anchor component={Link} to="/corporates" size="sm">Corporate</Anchor>
        <Anchor component={Link} to={`/corporates/${o.corporateId}`} size="sm">{o.corporateName}</Anchor>
        <Text size="sm">{o.title}</Text>
      </Breadcrumbs>
      <PageHeader title={<Group gap="sm">{o.title}<StatusBadge status={o.stage} size="md" /></Group>} subtitle={!closed && HINT[o.stage]}
        actions={<>
          {o.stage === "quote" && <Button variant="subtle" color="red" onClick={async () => { if (confirm("Delete this order?")) { await deleteDoc(doc(db, "corporateOrders", id!)); nav(`/corporates/${o.corporateId}`); } }}>Delete</Button>}
          {!closed && <Button variant="light" color="red" onClick={() => setStage("cancelled")}>Cancel order</Button>}
          {dirty && <Button variant="light" onClick={save}>Save changes</Button>}
          {next && <Button onClick={() => { setSf({ note: "", deductStock: !!o.sku, location: null, courier: f.shipping.courier, trackingNo: f.shipping.trackingNo }); setStage(next); }}>Move to {label(next)}</Button>}
        </>} />

      <Paper withBorder p="md" mb="lg">
        <Stepper active={o.stage === "cancelled" ? -1 : idx} size="xs" allowNextStepsSelect={false}>
          {FLOW.map((s) => <Stepper.Step key={s} label={label(s)} />)}
        </Stepper>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }} mb="lg">
        <Paper withBorder p="md">
          <Stack>
            <TextInput label="Order title" value={f.title} onChange={(e) => set({ title: e.currentTarget.value })} />
            <Group grow>
              <NumberInput label="Quantity (decks)" min={1} value={f.qty} onChange={(v) => set({ qty: Number(v) || 0 })} />
              <NumberInput label="Unit price" min={0} decimalScale={2} value={f.unitPrice} onChange={(v) => set({ unitPrice: Number(v) || 0 })} />
            </Group>
            <Field label="Order value">{money(total, o.currency)}</Field>
            <Select label="Deck design" description="Create a Corporate deck under Deck designs for their artwork" clearable searchable value={f.deckId} onChange={(v) => set({ deckId: v })}
              data={decks.data.map((d) => ({ value: d.id, label: `${d.name}${d.corporateId === o.corporateId ? " ★" : ""}` }))} />
            <Select label="Inventory SKU" description="Stock is deducted from this SKU when the order ships" clearable searchable value={f.sku} onChange={(v) => set({ sku: v })}
              data={inv.data.map((s) => ({ value: s.id, label: `${s.id} — ${s.name} (${s.onHand} on hand)` }))} />
            <Textarea label="Notes" autosize value={f.notes} onChange={(e) => set({ notes: e.currentTarget.value })} />
          </Stack>
        </Paper>
        <Stack>
          <Paper withBorder p="md">
            <Group justify="space-between" mb="xs"><Text fw={600}>Client design files</Text>
              <FileButton onChange={(file) => upload(file, "design")}>{(p) => <Button size="xs" variant="light" leftSection={<IconUpload size={14} />} {...p}>Upload</Button>}</FileButton></Group>
            {!(o.designFiles ?? []).length ? <Text size="sm" c="dimmed">No files yet. Logos, artwork and brand guides go here.</Text> : (
              <Table><Table.Tbody>{o.designFiles.map((d: any, i: number) => (
                <Table.Tr key={d.path}>
                  <Table.Td><Anchor size="sm" onClick={() => open(d.path)}>{d.name}</Anchor></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{fmtDate(d.at)}</Text></Table.Td>
                  <Table.Td w={30}><ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeDesign(i)}><IconTrash size={14} /></ActionIcon></Table.Td>
                </Table.Tr>))}</Table.Tbody></Table>
            )}
          </Paper>
          <Paper withBorder p="md">
            <Group justify="space-between" mb="xs"><Text fw={600}>Proof approval</Text>
              <FileButton onChange={(file) => upload(file, "proof")}>{(p) => <Button size="xs" variant="light" leftSection={<IconUpload size={14} />} {...p}>{o.proof ? "Upload new proof" : "Upload proof"}</Button>}</FileButton></Group>
            {!o.proof ? <Text size="sm" c="dimmed">Upload a PDF or mock-up for the client to sign off. Production stays locked until the proof is approved.</Text> : (
              <Stack gap="xs">
                <Group><Anchor size="sm" onClick={() => open(o.proof.path)}><IconDownload size={14} /> {o.proof.name}</Anchor>
                  <StatusBadge status={o.proof.status === "pending" ? "awaiting_approval" : o.proof.status} /></Group>
                {o.proof.decidedBy && <Text size="sm">{label(o.proof.status)} by <b>{o.proof.decidedBy}</b> on {fmtDate(o.proof.decidedAt, true)}{o.proof.notes ? `: "${o.proof.notes}"` : ""}</Text>}
                {o.proof.status === "pending" && (
                  <Group gap="xs">
                    <Button size="xs" color="green" onClick={() => { setDec({ approvedBy: "", notes: "" }); setDecision("approved"); }}>Client approved</Button>
                    <Button size="xs" color="red" variant="light" onClick={() => { setDec({ approvedBy: "", notes: "" }); setDecision("rejected"); }}>Client requested changes</Button>
                  </Group>
                )}
              </Stack>
            )}
          </Paper>
          <Paper withBorder p="md">
            <Text fw={600} mb="xs">Shipping</Text>
            <Textarea label="Delivery address" autosize value={f.shipping.address} onChange={(e) => set({ shipping: { ...f.shipping, address: e.currentTarget.value } })} />
            <Group grow mt="xs">
              <TextInput label="Courier" value={f.shipping.courier} onChange={(e) => set({ shipping: { ...f.shipping, courier: e.currentTarget.value } })} />
              <TextInput label="Tracking no." value={f.shipping.trackingNo} onChange={(e) => set({ shipping: { ...f.shipping, trackingNo: e.currentTarget.value } })} />
            </Group>
            {o.stockDeducted && <Text size="xs" c="dimmed" mt="xs">✓ {o.qty} units deducted from {o.sku}</Text>}
          </Paper>
        </Stack>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md">
          <Text fw={600} mb="sm">Quotes &amp; invoices for this order</Text>
          <InvoicesTab corpId={o.corporateId} corporateOrderId={id} defaults={{
            lineItems: (type: string) => {
              const desc = `${o.title} — ${o.qty} custom printed decks`;
              if (type === "deposit") return [{ description: `50% deposit: ${desc}`, qty: 1, unitPrice: Math.round(o.qty * o.unitPrice * 50) / 100 }];
              if (type === "balance") return [{ description: `Balance (50%): ${desc}`, qty: 1, unitPrice: Math.round(o.qty * o.unitPrice * 50) / 100 }];
              return [{ description: desc, qty: o.qty, unitPrice: o.unitPrice }];
            },
          }} />
        </Paper>
        <Paper withBorder p="md">
          <Text fw={600} mb="md">Timeline</Text>
          <Timeline bulletSize={14} lineWidth={2} active={o.timeline?.length}>
            {[...(o.timeline ?? [])].reverse().map((e: any, i: number) => (
              <Timeline.Item key={i} title={label(e.stage)}><Text size="xs" c="dimmed">{fmtDate(e.at, true)} {e.by && `· ${e.by}`}</Text>{e.note && <Text size="sm">{e.note}</Text>}</Timeline.Item>
            ))}
          </Timeline>
        </Paper>
      </SimpleGrid>

      <Modal opened={!!stage} onClose={() => setStage(null)} title={`Move to ${label(stage)}`}>
        <Stack>
          {dirty && <Alert color="yellow">You have unsaved changes. Save them first.</Alert>}
          {stage && FLOW.indexOf(stage as any) >= FLOW.indexOf("production") && o.proof?.status !== "approved" && stage !== "cancelled" &&
            <Alert color="red">The proof must be approved before production.</Alert>}
          {stage === "shipped" && <>
            <Checkbox label={o.sku ? `Deduct ${o.qty} units from ${o.sku}` : "No SKU linked, so no stock will be deducted"} disabled={!o.sku || o.stockDeducted}
              checked={!!o.sku && sf.deductStock && !o.stockDeducted} onChange={(e) => setSf({ ...sf, deductStock: e.currentTarget.checked })} />
            {o.sku && <Select label="Ship from" value={sf.location ?? defaultLocation} allowDeselect={false} onChange={(v) => setSf({ ...sf, location: v })} data={locations.map((l) => ({ value: l.id, label: l.name }))} />}
            <Group grow>
              <TextInput label="Courier" value={sf.courier} onChange={(e) => setSf({ ...sf, courier: e.currentTarget.value })} />
              <TextInput label="Tracking no." value={sf.trackingNo} onChange={(e) => setSf({ ...sf, trackingNo: e.currentTarget.value })} />
            </Group>
          </>}
          <Textarea label="Note" value={sf.note} onChange={(e) => setSf({ ...sf, note: e.currentTarget.value })} />
          <Button onClick={moveStage} loading={busy} color={stage === "cancelled" ? "red" : undefined} disabled={dirty}>Confirm</Button>
        </Stack>
      </Modal>
      <Modal opened={!!decision} onClose={() => setDecision(null)} title={decision === "approved" ? "Record proof approval" : "Record requested changes"}>
        <Stack>
          <TextInput label="Who at the client?" required placeholder="Name and role" value={dec.approvedBy} onChange={(e) => setDec({ ...dec, approvedBy: e.currentTarget.value })} />
          <Textarea label={decision === "approved" ? "Notes (e.g. 'approved by email 3 Nov')" : "What needs changing?"} value={dec.notes} onChange={(e) => setDec({ ...dec, notes: e.currentTarget.value })} />
          <Button onClick={decide} loading={busy} disabled={!dec.approvedBy.trim()} color={decision === "approved" ? "green" : "red"}>Save</Button>
        </Stack>
      </Modal>
    </>
  );
}
