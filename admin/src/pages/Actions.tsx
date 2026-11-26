import { useEffect, useState } from "react";
import { Button, Group, SegmentedControl, Table, Text, TextInput, Textarea, Badge, Select, Tooltip } from "@mantine/core";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { db } from "../lib/firebase";
import { useDocument } from "../lib/hooks";
import { PageHeader, Loading } from "../components/ui";
import { ACTION_KEYS, RANK_NAMES, LANGUAGES, GAME_EFFECTS, DEFAULT_EFFECTS, GameEffect } from "../lib/cards";
import { toastError, toastOk } from "../lib/call";
import { logAudit } from "../lib/audit";

/** Universal action text: one title + action per rank (and Joker), per language, shared by every deck. */
export default function ActionsPage() {
  const d = useDocument<any>(doc(db, "settings", "actions"), []);
  const [actions, setActions] = useState<any>(null);
  const [effects, setEffects] = useState<Partial<Record<string, GameEffect>>>(DEFAULT_EFFECTS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState("en");

  useEffect(() => { if (!d.loading && !actions) { setActions(d.data?.actions ?? {}); setEffects(d.data?.effects ?? DEFAULT_EFFECTS); } }, [d.loading]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!actions) return <Loading />;

  const setAction = (rank: string, field: "title" | "text", value: string) => {
    setActions({ ...actions, [rank]: { ...(actions[rank] ?? {}), [lang]: { ...(actions[rank]?.[lang] ?? { title: "", text: "" }), [field]: value } } });
    setDirty(true);
  };
  const filled = ACTION_KEYS.filter((r) => actions[r]?.[lang]?.text).length;

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "actions"), { actions, effects, updatedAt: serverTimestamp() }, { merge: true });
      logAudit("settings.update", "settings", "actions");
      setDirty(false);
      toastOk("Action text saved");
    } catch (e) { toastError(e); } finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader
        title="Action text"
        subtitle="Universal for every deck: one action per rank, used on all four suits. Override single cards in a deck's Text style & preview tab. 'In the player app' adds an interaction when the card is drawn."
        actions={<Button leftSection={<IconDeviceFloppy size={16} />} onClick={save} loading={saving} disabled={!dirty}>{dirty ? "Save changes" : "Saved"}</Button>}
      />
      <Group mb="md" justify="space-between">
        <Badge variant="light">{filled}/{ACTION_KEYS.length} filled in {LANGUAGES[lang]}</Badge>
        <SegmentedControl value={lang} onChange={setLang} data={Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }))} />
      </Group>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="xs">
          <Table.Thead><Table.Tr><Table.Th w={90}>Card</Table.Th><Table.Th w={220}>Title</Table.Th><Table.Th>Action text</Table.Th><Table.Th w={170}>In the player app</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {ACTION_KEYS.map((r) => (
              <Table.Tr key={r}>
                <Table.Td><Text fw={700}>{r === "JOKER" ? "Joker" : r}</Text><Text size="xs" c="dimmed">{RANK_NAMES[r] ?? ""}</Text></Table.Td>
                <Table.Td><TextInput placeholder="e.g. Waterfall" value={actions[r]?.[lang]?.title ?? ""} onChange={(e) => setAction(r, "title", e.currentTarget.value)} /></Table.Td>
                <Table.Td><Textarea autosize minRows={1} placeholder="What players do when this card is drawn" value={actions[r]?.[lang]?.text ?? ""} onChange={(e) => setAction(r, "text", e.currentTarget.value)} /></Table.Td>
                <Table.Td>
                  <Tooltip label={effects[r] ? GAME_EFFECTS[effects[r]!].help : "The card is just shown"} multiline w={240}>
                    <Select size="xs" allowDeselect={false} value={effects[r] ?? "none"}
                      data={[{ value: "none", label: "No effect" }, ...Object.entries(GAME_EFFECTS).map(([value, e]) => ({ value, label: e.label }))]}
                      onChange={(v) => { const e = { ...effects }; if (!v || v === "none") delete e[r]; else e[r] = v as GameEffect; setEffects(e); setDirty(true); }} />
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
}
