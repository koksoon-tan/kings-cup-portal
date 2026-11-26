import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router";
import {
  Tabs, Button, Group, Stack, TextInput, Select, MultiSelect, NumberInput, Textarea, Paper, Text, Alert, List,
  SimpleGrid, SegmentedControl, ColorInput, Slider, Switch, Grid, Progress, Anchor, Code, FileButton,
  Breadcrumbs, Checkbox, Tooltip,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { Dropzone } from "@mantine/dropzone";
import { doc, updateDoc, serverTimestamp, collection, addDoc, query, orderBy, deleteDoc, Timestamp } from "firebase/firestore";
import { ref as sref, uploadBytesResumable } from "firebase/storage";
import { IconUpload, IconFileZip, IconDeviceFloppy, IconDownload, IconAlertTriangle, IconTrash } from "@tabler/icons-react";
import JSZip from "jszip";
import { db, storage } from "../lib/firebase";
import { useCollection, useDocument, useStorageUrl, storageUrl } from "../lib/hooks";
import { PageHeader, StatusBadge, Loading } from "../components/ui";
import {
  CARD_KEYS, LANGUAGES, COUNTRIES, DEFAULT_STYLE, TextStyle, TitleStyle, TextBox, cardLabel, SUIT_SYMBOLS,
} from "../lib/cards";
import { SYSTEM_FONTS, FontDoc, ensureFont, resolveTitle, loadImage, drawCard, contentFor } from "../lib/render";
import { logAudit } from "../lib/audit";
import { toastError, toastOk } from "../lib/call";
import { fmtDate, toDate } from "../lib/format";
import { useNavigate } from "react-router";
import { askConfirm } from "../lib/confirm";

const EDITABLE = [
  "name", "code", "description", "status", "languages", "defaultLanguage", "countries", "appAccess", "appPrice",
  "expiryDate", "cardOverrides", "textStyle", "designer", "corporateId",
] as const;

// ---------------------------------------------------------------------------
// Canvas preview with drag-to-draw text box
// ---------------------------------------------------------------------------
function CardCanvas({ deck, cardKey, lang, fonts, onBox, showBox }: {
  deck: any; cardKey: string; lang: string; fonts: FontDoc[]; onBox?: (b: TextBox) => void; showBox?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const card = deck.cards?.[cardKey];
  const url = useStorageUrl(card?.previewPath);
  const [drag, setDrag] = useState<{ x0: number; y0: number } | null>(null);
  const { content, box } = contentFor(deck, cardKey, lang);
  const style: TextStyle = deck.textStyle;

  useEffect(() => {
    let alive = true;
    (async () => {
      const font = fonts.find((f) => f.id === style.fontId);
      await ensureFont(font).catch(() => undefined);
      await ensureFont(fonts.find((f) => f.id === resolveTitle(style).fontId)).catch(() => undefined);
      const img = url ? await loadImage(url).catch(() => null) : null;
      if (!alive || !canvasRef.current) return;
      const [w, h] = (deck.cardSize ?? "750x1050").split("x").map(Number);
      const ratio = h / w;
      drawCard(canvasRef.current, img, style, content, box, img ? undefined : { width: 600, height: Math.round(600 * ratio) });
    })();
    return () => { alive = false; };
  }, [url, JSON.stringify(style), JSON.stringify(content), JSON.stringify(box), fonts.length, deck.cardSize]);

  const pct = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) };
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", cursor: onBox ? "crosshair" : undefined, touchAction: onBox ? "none" : undefined, userSelect: "none" }}
      onPointerDown={onBox ? (e) => { const p = pct(e); setDrag({ x0: p.x, y0: p.y }); (e.target as Element).setPointerCapture(e.pointerId); } : undefined}
      onPointerMove={onBox && drag ? (e) => {
        const p = pct(e);
        const b = { x: Math.min(drag.x0, p.x), y: Math.min(drag.y0, p.y), w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0) };
        if (b.w > 2 && b.h > 2) onBox({ x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.w.toFixed(1), h: +b.h.toFixed(1) });
      } : undefined}
      onPointerUp={() => setDrag(null)}
    >
      <canvas ref={canvasRef} style={{ width: "100%", display: "block", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,.2)" }} />
      {showBox && cardKey !== "BACK" && (
        <div style={{
          position: "absolute", left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`,
          border: "2px dashed rgba(190,75,219,.9)", pointerEvents: "none", borderRadius: 4,
        }} />
      )}
    </div>
  );
}

function Thumb({ path, label }: { path?: string; label: string }) {
  const url = useStorageUrl(path);
  return (
    <Stack gap={2} align="center">
      <div style={{ width: "100%", aspectRatio: "5 / 7", background: "var(--mantine-color-gray-1)", borderRadius: 6, overflow: "hidden" }}>
        {url && <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <Text size="xs" c={path ? undefined : "red"}>{label}</Text>
    </Stack>
  );
}

// ---------------------------------------------------------------------------

export default function DeckEditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const deckRef = doc(db, "decks", id!);
  const live = useDocument<any>(deckRef, [id]);
  const fontsQ = useCollection<FontDoc>(query(collection(db, "fonts"), orderBy("name")));
  const corporates = useCollection<any>(collection(db, "corporates"));
  const globalActions = useDocument<any>(doc(db, "settings", "actions"), []);
  const [draft, setDraft] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState("en");
  const [cardKey, setCardKey] = useState("AS");
  const [upload, setUpload] = useState<number | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);

  useEffect(() => {
    if (live.data && !draft) {
      setDraft({ ...live.data, textStyle: { ...DEFAULT_STYLE, ...(live.data.textStyle ?? {}), box: { ...DEFAULT_STYLE.box, ...(live.data.textStyle?.box ?? {}) } } });
      setLang(live.data.defaultLanguage ?? "en");
    }
  }, [live.data]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Live fields (written by the zip processor) merged over the editable draft.
  const deck = useMemo(() => draft && live.data ? {
    ...draft, actions: globalActions.data?.actions ?? {}, cards: live.data.cards, upload: live.data.upload, artVersion: live.data.artVersion, cardSize: live.data.cardSize,
  } : null, [draft, live.data, globalActions.data]);

  if (live.loading || !deck) return live.loading || live.data ? <Loading /> : <Text>Deck not found.</Text>;

  const set = (patch: Record<string, unknown>) => { setDraft((d: any) => ({ ...d, ...patch })); setDirty(true); };
  const setTitle = (patch: Partial<TitleStyle>) => set({ textStyle: { ...deck.textStyle, title: { ...(deck.textStyle.title ?? {}), ...patch } } });
  const resetTitle = () => { const { title: _t, ...rest } = deck.textStyle; set({ textStyle: rest }); };
  const ts = resolveTitle(deck.textStyle);
  const titleFontValue = ts.fontId ? `id:${ts.fontId}` : `sys:${ts.fontFamily}`;
  const setStyle = (patch: Partial<TextStyle>) => set({ textStyle: { ...deck.textStyle, ...patch } });
  const override = deck.cardOverrides?.[cardKey] ?? {};
  const setOverride = (patch: Record<string, unknown> | null) => {
    const all = { ...(deck.cardOverrides ?? {}) };
    if (patch === null) delete all[cardKey];
    else {
      all[cardKey] = { ...override, ...patch };
      Object.keys(all[cardKey]).forEach((k) => all[cardKey][k] === undefined && delete all[cardKey][k]);
      if (!Object.keys(all[cardKey]).length) delete all[cardKey];
    }
    set({ cardOverrides: all });
  };

  const save = async () => {
    if (!deck.languages?.length) return toastError({ message: "Pick at least one language." });
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      EDITABLE.forEach((k) => { if (deck[k] !== undefined) patch[k] = deck[k]; });
      patch.expiryDate = deck.expiryDate ? Timestamp.fromDate(toDate(deck.expiryDate)!) : null;
      if (!deck.languages.includes(deck.defaultLanguage)) patch.defaultLanguage = deck.languages[0];
      patch.updatedAt = serverTimestamp();
      await updateDoc(deckRef, patch);
      logAudit("deck.update", "decks", id!, { status: deck.status });
      setDirty(false);
      toastOk("Deck saved");
    } catch (e) { toastError(e); } finally { setSaving(false); }
  };

  const uploadZip = (file: File) => {
    const path = `decks/${id}/uploads/${Date.now()}.zip`;
    const task = uploadBytesResumable(sref(storage, path), file, { contentType: "application/zip" });
    setUpload(0);
    updateDoc(deckRef, { "upload.status": "uploading", "upload.errors": [], "upload.warnings": [] }).catch(() => undefined);
    task.on("state_changed",
      (s) => setUpload(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      (e) => { setUpload(null); toastError(e); },
      () => { setUpload(null); toastOk("Uploaded — validating and processing cards…"); logAudit("deck.uploadZip", "decks", id!, { path }); });
  };

  const uploadFont = async (file: File | null) => {
    if (!file) return;
    const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, "");
    try {
      const path = `fonts/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
      await uploadBytesResumable(sref(storage, path), file);
      const f = await addDoc(collection(db, "fonts"), { name, path, createdAt: serverTimestamp() });
      setStyle({ fontId: f.id, fontFamily: "Arial" });
      toastOk(`Font "${name}" added`);
    } catch (e) { toastError(e); }
  };

  const exportPrint = async () => {
    if (dirty) return toastError({ message: "Save your changes before exporting." });
    const keys = CARD_KEYS.filter((k) => deck.cards?.[k]);
    if (!keys.length) return toastError({ message: "Upload the card art first." });
    setExporting(0);
    try {
      await ensureFont(fontsQ.data.find((f) => f.id === deck.textStyle.fontId));
      await ensureFont(fontsQ.data.find((f) => f.id === resolveTitle(deck.textStyle).fontId));
      const zip = new JSZip();
      let i = 0;
      for (const key of keys) {
        const img = await loadImage(await storageUrl(deck.cards[key].path), true);
        const canvas = document.createElement("canvas");
        const { content, box } = contentFor(deck, key, lang);
        drawCard(canvas, img, deck.textStyle, content, box);
        const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), "image/png"));
        zip.file(`${key}.png`, blob);
        setExporting(Math.round((++i / keys.length) * 100));
      }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `${(deck.code || deck.name).replace(/\W+/g, "_")}_${lang}_print_v${deck.artVersion}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      logAudit("deck.exportPrint", "decks", id!, { lang });
    } catch (e) { toastError(e); } finally { setExporting(null); }
  };

  const remove = async () => {
    if (!(await askConfirm("Delete this draft deck? This can't be undone.", "Delete deck"))) return;
    try { await deleteDoc(deckRef); logAudit("deck.delete", "decks", id!); nav("/decks"); } catch (e) { toastError(e); }
  };

  const langOptions = (deck.languages ?? []).map((l: string) => ({ value: l, label: LANGUAGES[l] ?? l }));
  const fontOptions = [
    { group: "Uploaded fonts", items: fontsQ.data.map((f) => ({ value: `id:${f.id}`, label: f.name })) },
    { group: "System fonts", items: SYSTEM_FONTS.map((f) => ({ value: `sys:${f}`, label: f })) },
  ];
  const fontValue = deck.textStyle.fontId ? `id:${deck.textStyle.fontId}` : `sys:${deck.textStyle.fontFamily}`;

  return (
    <>
      <Breadcrumbs mb="xs"><Anchor component={Link} to="/decks" size="sm">Deck designs</Anchor><Text size="sm">{deck.name}</Text></Breadcrumbs>
      <PageHeader
        title={<Group gap="sm">{deck.name}<StatusBadge status={deck.status} size="md" /></Group>}
        subtitle={`${deck.type === "inhouse" ? "In-house" : deck.type === "corporate" ? "Corporate" : "External designer"} deck · art ${deck.artVersion ? `v${deck.artVersion}` : "not uploaded"}`}
        actions={<>
          {deck.status === "draft" && <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={remove}>Delete</Button>}
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={save} loading={saving} disabled={!dirty}>{dirty ? "Save changes" : "Saved"}</Button>
        </>}
      />

      <Tabs defaultValue="art" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="art">Card art</Tabs.Tab>
          <Tabs.Tab value="style">Text style &amp; preview</Tabs.Tab>
          <Tabs.Tab value="details">Details &amp; release</Tabs.Tab>
          <Tabs.Tab value="export">Print export</Tabs.Tab>
        </Tabs.List>

        {/* ---------------- Card art ---------------- */}
        <Tabs.Panel value="art">
          <Grid>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Stack>
                <Dropzone onDrop={(f) => f[0] && uploadZip(f[0])} accept={["application/zip", "application/x-zip-compressed"]} maxFiles={1}
                  maxSize={500 * 1024 ** 2} loading={upload !== null} onReject={() => toastError({ message: "Upload a single .zip under 500 MB." })}>
                  <Group justify="center" gap="md" mih={110} style={{ pointerEvents: "none" }}>
                    <Dropzone.Accept><IconUpload size={40} /></Dropzone.Accept>
                    <Dropzone.Idle><IconFileZip size={40} stroke={1.4} /></Dropzone.Idle>
                    <div>
                      <Text fw={600}>Drop the deck .zip here</Text>
                      <Text size="sm" c="dimmed">55 images · uploading replaces the current art</Text>
                    </div>
                  </Group>
                </Dropzone>
                {upload !== null && <Progress value={upload} animated />}
                <Paper withBorder p="sm">
                  <Group justify="space-between" mb={4}><Text fw={600} size="sm">Processing status</Text><StatusBadge status={deck.upload?.status} /></Group>
                  {deck.upload?.processedAt && <Text size="xs" c="dimmed">Last processed {fmtDate(deck.upload.processedAt, true)}</Text>}
                  {deck.upload?.errors?.length > 0 && (
                    <Alert color="red" mt="sm" icon={<IconAlertTriangle size={16} />} title="Upload rejected — nothing was changed">
                      <List size="sm">{deck.upload.errors.map((e: string) => <List.Item key={e}>{e}</List.Item>)}</List>
                    </Alert>
                  )}
                  {deck.upload?.warnings?.length > 0 && (
                    <Alert color="yellow" mt="sm" title="Warnings">
                      <List size="sm">{deck.upload.warnings.map((e: string) => <List.Item key={e}>{e}</List.Item>)}</List>
                    </Alert>
                  )}
                </Paper>
                <Paper withBorder p="sm">
                  <Text fw={600} size="sm" mb={4}>File naming</Text>
                  <Text size="sm">Name each image <Code>RANK + SUIT</Code>. Any folder inside the zip is fine, and PNG, JPG and WebP are all accepted.</Text>
                  <List size="sm" mt={6}>
                    <List.Item>Ranks: <Code>A 2 3 4 5 6 7 8 9 10 J Q K</Code></List.Item>
                    <List.Item>Suits: <Code>S</Code> spades, <Code>H</Code> hearts, <Code>D</Code> diamonds, <Code>C</Code> clubs</List.Item>
                    <List.Item>Examples: <Code>AS.png</Code> <Code>10H.png</Code> <Code>QD.jpg</Code></List.Item>
                    <List.Item>Jokers: <Code>JK1.png</Code> <Code>JK2.png</Code>. Card back: <Code>BACK.png</Code></List.Item>
                  </List>
                  <Text size="xs" c="dimmed" mt={6}>All cards must be the same pixel size. For printing, use at least 300 DPI including bleed.</Text>
                </Paper>
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              {deck.cards ? (
                <SimpleGrid cols={{ base: 5, sm: 7, lg: 9 }} spacing={6} verticalSpacing={6}>
                  {CARD_KEYS.map((k) => (
                    <Thumb key={k} path={deck.cards?.[k]?.previewPath}
                      label={k === "BACK" ? "Back" : k.startsWith("JK") ? k : `${k.slice(0, -1)}${SUIT_SYMBOLS[k.slice(-1)]}`} />
                  ))}
                </SimpleGrid>
              ) : <Paper withBorder p="xl"><Text c="dimmed" ta="center">No card art yet.</Text></Paper>}
              {deck.cardSize && <Text size="xs" c="dimmed" mt="xs">Card size: {deck.cardSize}px</Text>}
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* ---------------- Style & preview ---------------- */}
        <Tabs.Panel value="style">
          <Grid gutter="xl">
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Stack>
                <Paper withBorder p="md">
                  <Group justify="space-between" mb="sm">
                    <Text fw={600}>Title style (whole deck)</Text>
                    <Button size="compact-xs" variant="subtle" onClick={resetTitle} disabled={!deck.textStyle.title}>Reset to follow action text</Button>
                  </Group>
                  <Select label="Font" data={fontOptions} value={titleFontValue} allowDeselect={false} searchable
                    onChange={(v) => v && (v.startsWith("id:") ? setTitle({ fontId: v.slice(3) }) : setTitle({ fontId: null, fontFamily: v.slice(4) }))} />
                  <Group grow mt="sm">
                    <ColorInput label="Text colour" value={ts.color} onChange={(v) => setTitle({ color: v })} />
                    <ColorInput label="Outline colour" value={ts.strokeColor} onChange={(v) => setTitle({ strokeColor: v })} />
                  </Group>
                  <Text size="sm" mt="sm">Font size</Text>
                  <Slider min={2} max={20} step={0.1} value={ts.sizePct} onChange={(v) => setTitle({ sizePct: v })} label={(v) => `${v.toFixed(1)}%`} />
                  <Text size="sm" mt="sm">Outline thickness</Text>
                  <Slider min={0} max={20} step={1} value={ts.strokeWidth} onChange={(v) => setTitle({ strokeWidth: v })} />
                  <Group mt="md" gap="lg">
                    <SegmentedControl size="xs" value={ts.align} onChange={(v) => setTitle({ align: v as any })} data={["left", "center", "right"]} />
                  </Group>
                  <Group mt="md">
                    <Switch label="Bold" checked={ts.bold} onChange={(e) => setTitle({ bold: e.currentTarget.checked })} />
                    <Switch label="UPPERCASE" checked={ts.uppercase} onChange={(e) => setTitle({ uppercase: e.currentTarget.checked })} />
                  </Group>
                </Paper>
                <Paper withBorder p="md">
                  <Text fw={600} mb="sm">Action text style (whole deck)</Text>
                  <Group grow align="flex-end">
                    <Select label="Font" data={fontOptions} value={fontValue} allowDeselect={false} searchable
                      onChange={(v) => v && (v.startsWith("id:") ? setStyle({ fontId: v.slice(3) }) : setStyle({ fontId: null, fontFamily: v.slice(4) }))} />
                    <FileButton onChange={uploadFont} accept=".ttf,.otf,.woff,.woff2">
                      {(props) => <Button variant="light" {...props}>Upload font file</Button>}
                    </FileButton>
                  </Group>
                  <Group grow mt="sm">
                    <ColorInput label="Text colour" value={deck.textStyle.color} onChange={(v) => setStyle({ color: v })} />
                    <ColorInput label="Outline colour" value={deck.textStyle.strokeColor} onChange={(v) => setStyle({ strokeColor: v })} />
                  </Group>
                  <Text size="sm" mt="sm">Font size</Text>
                  <Slider min={2} max={12} step={0.1} value={deck.textStyle.sizePct} onChange={(v) => setStyle({ sizePct: v })} label={(v) => `${v}%`} />
                  <Text size="sm" mt="sm">Outline thickness</Text>
                  <Slider min={0} max={20} step={1} value={deck.textStyle.strokeWidth} onChange={(v) => setStyle({ strokeWidth: v })} />
                  <Group mt="md" gap="lg">
                    <SegmentedControl size="xs" value={deck.textStyle.align} onChange={(v) => setStyle({ align: v as any })} data={["left", "center", "right"]} />
                    <SegmentedControl size="xs" value={deck.textStyle.vAlign} onChange={(v) => setStyle({ vAlign: v as any })} data={["top", "middle", "bottom"]} />
                  </Group>
                  <Group mt="md">
                    <Switch label="Bold" checked={deck.textStyle.bold} onChange={(e) => setStyle({ bold: e.currentTarget.checked })} />
                    <Switch label="UPPERCASE" checked={deck.textStyle.uppercase} onChange={(e) => setStyle({ uppercase: e.currentTarget.checked })} />
                    <Switch label="Show title" checked={deck.textStyle.showTitle} onChange={(e) => setStyle({ showTitle: e.currentTarget.checked })} />
                  </Group>
                </Paper>
                <Paper withBorder p="md">
                  <Text fw={600}>Text placeholder</Text>
                  <Text size="sm" c="dimmed" mb="sm">Drag on the preview to draw where the action text goes. Values are % of the card size.</Text>
                  <SimpleGrid cols={4}>
                    {(["x", "y", "w", "h"] as const).map((k) => (
                      <NumberInput key={k} label={{ x: "Left", y: "Top", w: "Width", h: "Height" }[k]} min={0} max={100} step={0.5} decimalScale={1} suffix="%"
                        value={(override.box ?? deck.textStyle.box)[k]}
                        onChange={(v) => {
                          const b = { ...(override.box ?? deck.textStyle.box), [k]: Number(v) || 0 };
                          override.box ? setOverride({ box: b }) : setStyle({ box: b });
                        }} />
                    ))}
                  </SimpleGrid>
                  <Checkbox mt="md" label={`Use a different position just for ${cardLabel(cardKey)}`} checked={!!override.box}
                    onChange={(e) => setOverride({ box: e.currentTarget.checked ? { ...deck.textStyle.box } : undefined })} />
                  <Checkbox mt="xs" label={`Use different text just for ${cardLabel(cardKey)} (${LANGUAGES[lang] ?? lang})`} checked={!!override.text?.[lang]}
                    disabled={cardKey === "BACK"}
                    onChange={(e) => {
                      const text = { ...(override.text ?? {}) };
                      if (e.currentTarget.checked) text[lang] = { ...(contentFor(deck, cardKey, lang).content ?? { title: "", text: "" }) };
                      else delete text[lang];
                      setOverride({ text: Object.keys(text).length ? text : undefined });
                    }} />
                  {override.text?.[lang] && (
                    <Stack gap="xs" mt="xs">
                      <TextInput label="Title" value={override.text[lang].title} onChange={(e) => setOverride({ text: { ...override.text, [lang]: { ...override.text[lang], title: e.currentTarget.value } } })} />
                      <Textarea label="Text" autosize value={override.text[lang].text} onChange={(e) => setOverride({ text: { ...override.text, [lang]: { ...override.text[lang], text: e.currentTarget.value } } })} />
                    </Stack>
                  )}
                </Paper>
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Stack style={{ position: "sticky", top: 70 }}>
                <Group grow>
                  <Select label="Card" value={cardKey} onChange={(v) => v && setCardKey(v)} allowDeselect={false} searchable
                    data={CARD_KEYS.map((k) => ({ value: k, label: `${cardLabel(k)}${deck.cardOverrides?.[k] ? " ★" : ""}` }))} />
                  <Select label="Language" value={lang} onChange={(v) => v && setLang(v)} data={langOptions} allowDeselect={false} />
                </Group>
                <div style={{ maxWidth: 380, width: "100%", margin: "0 auto" }}>
                  <CardCanvas deck={deck} cardKey={cardKey} lang={lang} fonts={fontsQ.data} showBox
                    onBox={(b) => (override.box ? setOverride({ box: b }) : setStyle({ box: b }))} />
                </div>
                {!deck.cards && <Text size="xs" c="dimmed" ta="center">Upload card art to preview on the real design.</Text>}
                <Text size="xs" c="dimmed" ta="center">★ = card has its own override. Text shrinks automatically to fit the box.</Text>
              </Stack>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* ---------------- Details ---------------- */}
        <Tabs.Panel value="details">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Paper withBorder p="md">
              <Stack>
                <TextInput label="Deck name" value={deck.name} onChange={(e) => set({ name: e.currentTarget.value })} />
                <TextInput label="Deck code" value={deck.code ?? ""} onChange={(e) => set({ code: e.currentTarget.value.toUpperCase() })} />
                <Textarea label="Description" autosize minRows={2} value={deck.description ?? ""} onChange={(e) => set({ description: e.currentTarget.value })} />
                <Select label="Status" value={deck.status} allowDeselect={false} onChange={(v) => set({ status: v })}
                  data={[{ value: "draft", label: "Draft" }, { value: "review", label: "In review" }, { value: "published", label: "Published" }, { value: "archived", label: "Archived" }]} />
                {deck.type === "corporate" && (
                  <Select label="Corporate client" value={deck.corporateId} onChange={(v) => set({ corporateId: v })} searchable
                    data={corporates.data.map((c) => ({ value: c.id, label: c.company }))} />
                )}
                {deck.type === "external" && (
                  <Group grow>
                    <TextInput label="Designer" value={deck.designer?.name ?? ""} onChange={(e) => set({ designer: { ...deck.designer, name: e.currentTarget.value } })} />
                    <NumberInput label="Royalty %" min={0} max={100} value={deck.designer?.royaltyPct ?? 0} onChange={(v) => set({ designer: { ...deck.designer, royaltyPct: Number(v) || 0 } })} />
                  </Group>
                )}
              </Stack>
            </Paper>
            <Paper withBorder p="md">
              <Stack>
                <MultiSelect label="Languages" description="Action text needed in each language" value={deck.languages ?? []}
                  data={Object.entries(LANGUAGES).map(([value, l]) => ({ value, label: l }))} onChange={(v) => set({ languages: v })} />
                <Select label="Default language" value={deck.defaultLanguage} data={langOptions} allowDeselect={false} onChange={(v) => set({ defaultLanguage: v })} />
                <MultiSelect label="Release countries" description="Where this deck is sold / visible in the app" searchable value={deck.countries ?? []}
                  data={Object.entries(COUNTRIES).map(([value, l]) => ({ value, label: l }))} onChange={(v) => set({ countries: v })} />
                <Select label="Mobile app access" value={deck.appAccess} allowDeselect={false} onChange={(v) => set({ appAccess: v })}
                  data={[{ value: "purchase", label: "Unlocked by buying the physical deck" }, { value: "free", label: "Free skin for all app users" }, { value: "paid", label: "Paid skin (in-app purchase)" }]} />
                {deck.appAccess === "paid" && <NumberInput label="In-app price" min={0} decimalScale={2} value={deck.appPrice ?? 0} onChange={(v) => set({ appPrice: Number(v) || 0 })} />}
                <Tooltip label="For limited-time decks / skins. Leave empty for no expiry." position="top-start">
                  <DateInput label="Expiry date" clearable value={toDate(deck.expiryDate)} onChange={(v) => set({ expiryDate: v ? new Date(v as any) : null })} />
                </Tooltip>
              </Stack>
            </Paper>
          </SimpleGrid>
        </Tabs.Panel>

        {/* ---------------- Export ---------------- */}
        <Tabs.Panel value="export">
          <Paper withBorder p="md" maw={640}>
            <Stack>
              <Text>This downloads all 55 cards as full-resolution PNG files, with the action text added to each card. Send the zip to your printer.</Text>
              <Select label="Language" value={lang} onChange={(v) => v && setLang(v)} data={langOptions} allowDeselect={false} w={240} />
              <Alert color="blue" variant="light">
                The PNGs use the same pixels as your uploaded art (RGB). If your printer needs CMYK or bleed marks, they can convert the files, or you can do it in your design tool.
              </Alert>
              {exporting !== null && <Progress value={exporting} animated />}
              <Group><Button leftSection={<IconDownload size={16} />} onClick={exportPrint} loading={exporting !== null}>Download print files</Button></Group>
            </Stack>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
