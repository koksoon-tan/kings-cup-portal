import { useEffect, useState } from "react";
import {
  Tabs, Paper, Stack, TextInput, Switch, NumberInput, Button, Group, Text, Textarea, Select, ActionIcon, Alert, Code, SimpleGrid,
} from "@mantine/core";
import { doc, setDoc } from "firebase/firestore";
import { IconTrash } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useDocument } from "../lib/hooks";
import { PageHeader, Loading } from "../components/ui";
import { toastError, toastOk } from "../lib/call";
import { logAudit } from "../lib/audit";

const GENERAL_DEFAULTS = { currency: "MYR", autoIssueCodeOnPaid: true, codeExpiryDays: 0, locations: [{ id: "main", name: "Main warehouse" }], defaultLocation: "main" };
const COMPANY_DEFAULTS = { name: "", regNo: "", taxId: "", address: "", email: "", phone: "", bankDetails: "", invoiceFooter: "", taxRate: 0, taxLabel: "SST", paymentTermsDays: 14 };
const EMAIL_DEFAULTS = {
  appName: "Kings Cup",
  codeSubject: "Your {{appName}} app access code",
  codeHtml: `<p>Hi {{name}},</p>
<p>Thanks for buying {{appName}}! Here is your personal code to unlock the mobile app:</p>
<p style="font-size:22px;font-weight:bold;letter-spacing:2px">{{code}}</p>
<p>Open the app and enter this code to sign in. The code works once and is linked to you – please don't share it.{{expiryLine}}</p>
<p>Cheers,<br/>The {{appName}} team</p>`,
};

function useSettingsDoc(id: string, defaults: any) {
  const d = useDocument<any>(doc(db, "settings", id), [id]);
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (!d.loading && !f) setF({ ...defaults, ...(d.data ?? {}) }); }, [d.loading]);
  const save = async () => {
    try {
      const { id: _omit, ...data } = f;
      await setDoc(doc(db, "settings", id), data, { merge: true });
      logAudit("settings.update", "settings", id);
      toastOk("Settings saved");
    } catch (e) { toastError(e); }
  };
  return { f, setF, save };
}

function General() {
  const { f, setF, save } = useSettingsDoc("general", GENERAL_DEFAULTS);
  if (!f) return <Loading />;
  const setLoc = (i: number, p: any) => setF({ ...f, locations: f.locations.map((l: any, j: number) => (i === j ? { ...l, ...p } : l)) });
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Paper withBorder p="md">
        <Stack>
          <TextInput label="Currency" description="3-letter code used on orders and invoices" value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.currentTarget.value.toUpperCase() })} />
          <Switch label="Generate and email an app code automatically when an order is paid" checked={f.autoIssueCodeOnPaid} onChange={(e) => setF({ ...f, autoIssueCodeOnPaid: e.currentTarget.checked })} />
          <NumberInput label="Codes expire after (days)" description="0 = codes never expire" min={0} value={f.codeExpiryDays} onChange={(v) => setF({ ...f, codeExpiryDays: Number(v) || 0 })} />
          <Group><Button onClick={save}>Save</Button></Group>
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Text fw={600}>Stock locations</Text>
        <Text size="sm" c="dimmed" mb="sm">Your warehouse, plus any marketplace fulfilment centres you use (e.g. Fulfilled by Shopee). Keep the IDs the same once stock is recorded.</Text>
        <Stack gap="xs">
          {f.locations.map((l: any, i: number) => (
            <Group key={i} wrap="nowrap">
              <TextInput placeholder="id" w={130} value={l.id} onChange={(e) => setLoc(i, { id: e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
              <TextInput placeholder="Name" style={{ flex: 1 }} value={l.name} onChange={(e) => setLoc(i, { name: e.currentTarget.value })} />
              <ActionIcon variant="subtle" color="red" disabled={f.locations.length === 1} onClick={() => setF({ ...f, locations: f.locations.filter((_: any, j: number) => j !== i) })}><IconTrash size={14} /></ActionIcon>
            </Group>
          ))}
          <Group><Button size="xs" variant="light" onClick={() => setF({ ...f, locations: [...f.locations, { id: "", name: "" }] })}>+ Add location</Button></Group>
          <Select label="Default location" value={f.defaultLocation} allowDeselect={false} onChange={(v) => setF({ ...f, defaultLocation: v })} data={f.locations.filter((l: any) => l.id).map((l: any) => ({ value: l.id, label: l.name || l.id }))} />
          <Group><Button onClick={save}>Save</Button></Group>
        </Stack>
      </Paper>
    </SimpleGrid>
  );
}

function Company() {
  const { f, setF, save } = useSettingsDoc("company", COMPANY_DEFAULTS);
  if (!f) return <Loading />;
  const t = (k: string, l: string, area = false) => area
    ? <Textarea label={l} autosize minRows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.currentTarget.value })} />
    : <TextInput label={l} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.currentTarget.value })} />;
  return (
    <Paper withBorder p="md" maw={720}>
      <Stack>
        <Text size="sm" c="dimmed">These details appear at the top of quotes and invoices.</Text>
        {t("name", "Company name")}
        <Group grow>{t("regNo", "Registration no.")}{t("taxId", "Tax ID / SST no.")}</Group>
        {t("address", "Address", true)}
        <Group grow>{t("email", "Email")}{t("phone", "Phone")}</Group>
        {t("bankDetails", "Bank / payment details (shown on invoices)", true)}
        {t("invoiceFooter", "Invoice footer")}
        <Group grow>
          <TextInput label="Default tax label" value={f.taxLabel} onChange={(e) => setF({ ...f, taxLabel: e.currentTarget.value })} />
          <NumberInput label="Default tax rate %" min={0} decimalScale={2} value={f.taxRate} onChange={(v) => setF({ ...f, taxRate: Number(v) || 0 })} />
          <NumberInput label="Payment terms (days)" min={0} value={f.paymentTermsDays} onChange={(v) => setF({ ...f, paymentTermsDays: Number(v) || 0 })} />
        </Group>
        <Group><Button onClick={save}>Save</Button></Group>
      </Stack>
    </Paper>
  );
}

function Email() {
  const { f, setF, save } = useSettingsDoc("email", EMAIL_DEFAULTS);
  if (!f) return <Loading />;
  const preview = f.codeHtml.replace(/\{\{name\}\}/g, "Jane").replace(/\{\{code\}\}/g, "KC-7XQ4-M9KD-2HTP").replace(/\{\{appName\}\}/g, f.appName).replace(/\{\{expiryLine\}\}/g, "");
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Paper withBorder p="md">
        <Stack>
          <Alert variant="light">
            Emails are sent by the <b>Trigger Email from Firestore</b> extension (see the README for setup). Placeholders you can use: <Code>{"{{name}}"}</Code> <Code>{"{{code}}"}</Code> <Code>{"{{appName}}"}</Code> <Code>{"{{expiryLine}}"}</Code>
          </Alert>
          <TextInput label="App name" value={f.appName} onChange={(e) => setF({ ...f, appName: e.currentTarget.value })} />
          <TextInput label="Subject" value={f.codeSubject} onChange={(e) => setF({ ...f, codeSubject: e.currentTarget.value })} />
          <Textarea label="Body (HTML)" autosize minRows={8} ff="monospace" value={f.codeHtml} onChange={(e) => setF({ ...f, codeHtml: e.currentTarget.value })} />
          <Group><Button onClick={save}>Save</Button><Button variant="subtle" onClick={() => setF({ ...f, ...EMAIL_DEFAULTS })}>Reset to default</Button></Group>
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">Preview</Text>
        <Text fw={600} mb="sm">{f.codeSubject.replace(/\{\{appName\}\}/g, f.appName)}</Text>
        <iframe title="preview" sandbox="" srcDoc={`<div style="font-family:sans-serif;font-size:14px">${preview}</div>`} style={{ width: "100%", minHeight: 320, border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, background: "white" }} />
      </Paper>
    </SimpleGrid>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs defaultValue="general" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="general">General &amp; stock</Tabs.Tab>
          <Tabs.Tab value="company">Company &amp; invoices</Tabs.Tab>
          <Tabs.Tab value="email">Code email</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="general"><General /></Tabs.Panel>
        <Tabs.Panel value="company"><Company /></Tabs.Panel>
        <Tabs.Panel value="email"><Email /></Tabs.Panel>
      </Tabs>
    </>
  );
}
