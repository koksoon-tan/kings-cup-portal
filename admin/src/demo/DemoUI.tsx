import { ReactNode, useEffect, useState } from "react";
import {
  Center, Paper, Stack, Title, Text, Progress, Group, Button, Alert, Table, Badge, TextInput, SimpleGrid, Code, Anchor, Modal,
} from "@mantine/core";
import { Link } from "react-router";
import { IconFlask, IconRefresh, IconMail, IconDeviceMobile } from "@tabler/icons-react";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/hooks";
import { fmtDate } from "../lib/format";
import { PageHeader } from "../components/ui";
import { isSeeded, seedDemo, DEMO_USERS, DEMO_PASSWORD } from "./seed";
import { resetDemo, store } from "./core";
import { invoke } from "./client-functions";

export const IS_DEMO = import.meta.env.VITE_DEMO === "true";

/** Seeds the demo data on first visit before rendering the app. */
export function DemoGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isSeeded());
  const [step, setStep] = useState("Starting");
  const [n, setN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (ready) return;
    seedDemo((s) => { setStep(s); setN((x) => x + 1); }).then(() => setReady(true)).catch((e) => { console.error(e); setError(String(e?.message ?? e)); });
  }, []);
  if (ready) return <>{children}</>;
  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w="100%" maw={440}>
        <Stack>
          <Title order={3}>👑 Setting up the demo…</Title>
          <Text size="sm" c="dimmed">Creating sample decks, stock, orders, customers, app codes and corporate clients. This takes a few seconds and only happens once.</Text>
          <Progress value={Math.min(100, (n / 16) * 100)} animated />
          <Text size="sm">{step}</Text>
          {error && <Alert color="red" title="Setup failed">{error}<Button mt="sm" size="xs" onClick={() => resetDemo().then(() => location.reload())}>Reset and retry</Button></Alert>}
        </Stack>
      </Paper>
    </Center>
  );
}

export function DemoBanner() {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Group gap="xs" wrap="nowrap" px="md" py={4} style={{ background: "var(--mantine-color-yellow-light)", fontSize: 13 }}>
        <IconFlask size={16} style={{ flex: "none" }} />
        <Text size="xs" style={{ flex: 1 }} lineClamp={2}>
          <b>Demo mode.</b> Everything runs in your browser with sample data. Emails aren't really sent; read them in the{" "}
          <Anchor component={Link} to="/demo-inbox" size="xs">Demo inbox</Anchor>.
        </Text>
        <Button size="compact-xs" variant="subtle" color="dark" leftSection={<IconRefresh size={12} />} onClick={() => setConfirm(true)}>Reset</Button>
      </Group>
      <Modal opened={confirm} onClose={() => setConfirm(false)} title="Reset demo data?">
        <Stack>
          <Text size="sm">This wipes everything you've changed and rebuilds the sample data.</Text>
          <Button color="red" onClick={() => resetDemo().then(() => { location.hash = ""; location.reload(); })}>Reset demo</Button>
        </Stack>
      </Modal>
    </>
  );
}

export function DemoLoginHelp({ onPick }: { onPick: (email: string, password: string) => void }) {
  return (
    <Alert variant="light" color="yellow" icon={<IconFlask size={16} />} title="Demo accounts">
      <Text size="xs" mb={6}>Password for all: <Code>{DEMO_PASSWORD}</Code>. Click to fill:</Text>
      <Stack gap={4}>
        {DEMO_USERS.map((u) => (
          <Anchor key={u.email} size="xs" component="button" type="button" ta="left" onClick={() => onPick(u.email, DEMO_PASSWORD)}>
            {u.email} — {u.role}
          </Anchor>
        ))}
      </Stack>
    </Alert>
  );
}

function MobileLoginTester() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const tryIt = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await invoke("redeemSerialCode", { code, device: navigator.userAgent.includes("Mobile") ? "Phone browser (demo)" : "Desktop browser (demo)" }, null);
      const c = store.get(`customers/${r.customerId}`);
      setResult({ ok: true, msg: `Signed in as ${c?.name || c?.email}. The code is now marked redeemed and can't be used again.` });
    } catch (e: any) { setResult({ ok: false, msg: e?.message ?? String(e) }); }
    finally { setBusy(false); }
  };
  return (
    <Paper withBorder p="md">
      <Group gap="xs" mb="xs"><IconDeviceMobile size={18} /><Text fw={600}>Try the mobile-app login</Text></Group>
      <Text size="sm" c="dimmed" mb="sm">This is what the app will do when a customer types the code from their email. Copy a code from an email on the left.</Text>
      <Group align="flex-end">
        <TextInput label="Serial code" placeholder="KC-XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.currentTarget.value)} style={{ flex: 1 }} />
        <Button onClick={tryIt} loading={busy} disabled={!code.trim()}>Redeem</Button>
      </Group>
      {result && <Alert mt="sm" color={result.ok ? "green" : "red"}>{result.msg}</Alert>}
    </Paper>
  );
}

export function DemoInboxPage() {
  const mail = useCollection<any>(query(collection(db, "mail"), orderBy("createdAt", "desc"), limit(100)));
  const [open, setOpen] = useState<any | null>(null);
  useEffect(() => { if (!open && mail.data[0]) setOpen(mail.data[0]); }, [mail.data.length]);
  const current = open && mail.data.find((m) => m.id === open.id);
  return (
    <>
      <PageHeader title="Demo inbox" subtitle="Every email the system would have sent. In production these go out through your email provider." />
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder p="md">
          <Group gap="xs" mb="sm"><IconMail size={18} /><Text fw={600}>{mail.data.length} emails</Text></Group>
          <Table highlightOnHover>
            <Table.Tbody>
              {mail.data.map((m) => (
                <Table.Tr key={m.id} onClick={() => setOpen(m)} style={{ cursor: "pointer", background: current?.id === m.id ? "var(--mantine-color-grape-light)" : undefined }}>
                  <Table.Td><Text size="sm" fw={600}>{m.to}</Text><Text size="xs" c="dimmed" lineClamp={1}>{m.message?.subject}</Text></Table.Td>
                  <Table.Td><Badge size="xs" variant="light" color={m.delivery?.state === "SUCCESS" ? "green" : "yellow"}>{m.delivery?.state === "SUCCESS" ? "delivered" : "sending"}</Badge></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{fmtDate(m.createdAt, true)}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
        <Stack>
          {current && (
            <Paper withBorder p="md">
              <Text size="xs" c="dimmed">To: {current.to}</Text>
              <Text fw={700} mb="sm">{current.message?.subject}</Text>
              <iframe title="email" sandbox="" srcDoc={`<div style="font-family:sans-serif;font-size:14px">${current.message?.html ?? ""}</div>`}
                style={{ width: "100%", minHeight: 260, border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, background: "white" }} />
            </Paper>
          )}
          <MobileLoginTester />
        </Stack>
      </SimpleGrid>
    </>
  );
}

// Hosted demo pages may block pop-ups and built-in PDF viewers, so files (invoice PDFs, proofs)
// open in an in-page viewer; PDFs are drawn with a bundled pdf.js.
let pdfjs: Promise<any> | null = null;
const getPdfjs = () => (pdfjs ??= (async () => {
  const [lib, worker] = await Promise.all([
    // @ts-ignore – no types for the prebuilt file
    import("pdfjs-dist/build/pdf.min.js"),
    // @ts-ignore
    import("pdfjs-dist/build/pdf.worker.min.js?url"),
  ]);
  const pdf = (lib as any).default?.getDocument ? (lib as any).default : (globalThis as any).pdfjsLib ?? lib;
  pdf.GlobalWorkerOptions.workerSrc = (worker as any).default;
  return pdf;
})());

async function renderInto(host: HTMLElement, url: string) {
  const blob = await (await fetch(url)).blob();
  if (blob.type.startsWith("image/")) {
    const img = document.createElement("img"); img.src = url; img.style.cssText = "max-width:100%;display:block;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.3)";
    host.appendChild(img); return;
  }
  if (blob.type === "application/pdf") {
    const lib = await getPdfjs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1.6 });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      c.style.cssText = "width:100%;max-width:820px;display:block;margin:0 auto 12px;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.3)";
      host.appendChild(c);
      await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    }
    return;
  }
  const p = document.createElement("p"); p.textContent = "This file type can't be previewed in the demo."; p.style.cssText = "color:#fff;text-align:center";
  host.appendChild(p);
}

if (IS_DEMO && typeof window !== "undefined") {
  const realOpen = window.open.bind(window);
  window.open = ((url?: string | URL, ...rest: any[]) => {
    const u = String(url ?? "");
    if (!u.startsWith("blob:")) return realOpen(url as any, ...rest);
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(20,10,30,.75);display:flex;flex-direction:column;padding:16px;gap:8px";
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    const close = document.createElement("button");
    close.textContent = "Close ✕"; close.onclick = () => overlay.remove();
    close.style.cssText = "padding:8px 14px;border-radius:8px;border:0;font:600 14px system-ui;cursor:pointer;background:#fff;color:#111";
    bar.appendChild(close);
    const body = document.createElement("div");
    body.style.cssText = "flex:1;overflow:auto;padding:8px";
    body.innerHTML = '<p style="color:#fff;text-align:center;font:14px system-ui">Loading…</p>';
    overlay.append(bar, body);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    renderInto(body, u).then(() => body.querySelector("p")?.remove()).catch((e) => { body.innerHTML = `<p style="color:#fff;text-align:center;font:14px system-ui">Couldn't show this file: ${String(e.message ?? e)}</p>`; });
    return null;
  }) as typeof window.open;
}
