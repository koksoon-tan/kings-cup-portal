import { useEffect, useState } from "react";
import { Modal, Stack, Select, NumberInput, TextInput, Textarea, Button, Text } from "@mantine/core";
import { call } from "../lib/call";
import { useLocations } from "../pages/Inventory";

const TYPES = [
  { value: "stock_in", label: "Stock in — print run received" },
  { value: "transfer", label: "Transfer between locations" },
  { value: "giveaway", label: "Giveaway / marketing" },
  { value: "damage", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "adjustment", label: "Correction (+/−)" },
];

export function AdjustStockModal({ sku, onClose, defaultType = "stock_in" }: { sku: string | null; onClose: () => void; defaultType?: string }) {
  const { locations, defaultLocation } = useLocations();
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (sku) setF({ type: defaultType, qty: 1, location: defaultLocation, toLocation: "", note: "", poNumber: "", unitCost: "" }); }, [sku]);

  const submit = async () => {
    setBusy(true);
    try {
      await call("adjustStock", { sku, ...f }, "Stock updated");
      onClose();
    } catch { /* toast shown */ } finally { setBusy(false); }
  };
  const locs = locations.map((l) => ({ value: l.id, label: l.name }));

  return (
    <Modal opened={!!sku} onClose={onClose} title={`Adjust stock · ${sku}`}>
      <Stack>
        <Select label="What happened?" data={TYPES} value={f.type} allowDeselect={false} onChange={(v) => setF({ ...f, type: v })} />
        <NumberInput label={f.type === "adjustment" ? "Change (use − to remove)" : "Quantity"} value={f.qty} onChange={(v) => setF({ ...f, qty: v })} allowNegative={f.type === "adjustment"} min={f.type === "adjustment" ? undefined : 1} />
        <Select label={f.type === "transfer" ? "From location" : "Location"} data={locs} value={f.location} allowDeselect={false} onChange={(v) => setF({ ...f, location: v })} />
        {f.type === "transfer" && <Select label="To location" data={locs} value={f.toLocation} onChange={(v) => setF({ ...f, toLocation: v })} />}
        {f.type === "stock_in" && <>
          <TextInput label="PO / printer invoice no." value={f.poNumber} onChange={(e) => setF({ ...f, poNumber: e.currentTarget.value })} />
          <NumberInput label="Unit cost" description="Used for stock value (weighted average)" min={0} decimalScale={4} value={f.unitCost} onChange={(v) => setF({ ...f, unitCost: v })} />
        </>}
        <Textarea label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.currentTarget.value })} />
        <Text size="xs" c="dimmed">Samples for corporates are recorded from the corporate's page so they're tracked against the client.</Text>
        <Button onClick={submit} loading={busy}>Save</Button>
      </Stack>
    </Modal>
  );
}
