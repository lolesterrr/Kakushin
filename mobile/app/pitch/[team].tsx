import React, { useState } from "react";
import { Alert, Image, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { api, authHeaders, uploadResult } from "../../lib/api";
import { API_URL } from "../../lib/config";
import { pitch as pitchSchema } from "../../lib/schemas";
import { fmtDate } from "../../lib/format";
import { useLoad } from "../../lib/useLoad";
import { useTheme } from "../../lib/theme";
import { Body, Button, Card, Field, H2, Label, Loading, Notice, Screen } from "../../components/ui";
import { Video, type MediaImage } from "../../components/media";
import { abs, pickImage, uploadImage } from "../../lib/media";
import { F } from "../../lib/fonts";

const MAX_DECK = 20 * 1024 * 1024;
type Msg = { kind: "ok" | "err"; text: string } | null;

/** Sends a PDF from the phone to the Worker as the raw request body, which is what the deck route expects. */
async function uploadDeck(teamId: string, asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  const url = `${API_URL}/api/teams/${teamId}/pitch/deck`;
  const name = asset.name || "deck.pdf";
  const headers = { ...authHeaders(), "Content-Type": "application/pdf", "X-File-Name": name };
  if (Platform.OS === "web") {
    // The browser preview hands back a real File, so a plain fetch works there.
    const res = await fetch(url, { method: "PUT", headers, body: asset.file ?? (await (await fetch(asset.uri)).blob()) });
    const data = (await uploadResult(res.status, await res.text())) as { deck_name?: string };
    return data.deck_name ?? name;
  }
  let res: FileSystem.FileSystemUploadResult;
  try {
    res = await FileSystem.uploadAsync(url, asset.uri, { httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers });
  } catch {
    throw new Error("Could not reach Kakushin. Check your connection and try again.");
  }
  const data = (await uploadResult(res.status, res.body)) as { deck_name?: string };
  return data.deck_name ?? name;
}

export default function PitchScreen() {
  const { team, name } = useLocalSearchParams<{ team: string; name?: string }>();
  const t = useTheme();
  const p = useLoad(() => api(`/teams/${team}/pitch`, { schema: pitchSchema }), [team]);
  const [form, setForm] = useState<{ video_url: string; demo_url: string; repo_url: string; notes: string } | null>(null);
  const [busy, setBusy] = useState<"deck" | "links" | null>(null);
  const [deckMsg, setDeckMsg] = useState<Msg>(null);
  const [msg, setMsg] = useState<Msg>(null);

  if (!p.data) return <Screen>{p.err ? <Notice kind="err">{p.err === "Not found" ? "We could not find that team." : p.err}</Notice> : <Loading />}</Screen>;

  const cur = p.data.pitch;
  const f = form ?? { video_url: cur?.video_url ?? "", demo_url: cur?.demo_url ?? "", repo_url: cur?.repo_url ?? "", notes: cur?.notes ?? "" };
  const set = (k: keyof typeof f) => (v: string) => setForm({ ...f, [k]: v });
  const late = !!p.data.due && Date.now() > p.data.due;
  const canEdit = p.data.open && !late;

  async function pickDeck() {
    setDeckMsg(null);
    const r = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets[0]) return;
    const asset = r.assets[0];
    if (asset.mimeType && asset.mimeType !== "application/pdf") { setDeckMsg({ kind: "err", text: "The deck must be a PDF" }); return; }
    if (asset.size && asset.size > MAX_DECK) { setDeckMsg({ kind: "err", text: "The deck is too large (max 20 MB)" }); return; }
    setBusy("deck");
    try { const saved = await uploadDeck(team, asset); await p.reload(); setDeckMsg({ kind: "ok", text: `Uploaded ${saved}` }); }
    catch (e) { setDeckMsg({ kind: "err", text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  async function saveLinks() {
    setMsg(null); setBusy("links");
    try { await api(`/teams/${team}/pitch`, { method: "PUT", json: f }); await p.reload(); setForm(null); setMsg({ kind: "ok", text: "Pitch saved" }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  return (
    <Screen onRefresh={p.refresh} refreshing={p.refreshing}>
      <Stack.Screen options={{ title: name ? `${name} pitch` : "Your pitch" }} />
      <Card>
        <Label>Pitch due</Label>
        <Text style={{ color: t.ink, fontSize: 17, fontWeight: "800" }}>{fmtDate(p.data.due)}</Text>
        {cur ? <Body muted style={{ fontSize: 13 }}>Last saved {fmtDate(cur.updated_at)}</Body> : null}
      </Card>
      {!p.data.open ? <Notice kind="err">Only shortlisted teams can submit a pitch.</Notice> : null}
      {p.data.open && late ? <Notice kind="err">The pitch deadline has passed, so the pitch can no longer be changed.</Notice> : null}

      <H2>Deck</H2>
      <Body muted>One PDF, up to 20 MB. Uploading again replaces the old one. Judges see the latest version.</Body>
      {cur?.has_deck ? (
        <Card><Text style={{ color: t.ink, fontSize: 16, fontWeight: "700" }}>{cur.deck_name ?? "deck.pdf"}</Text></Card>
      ) : <Body muted>No deck yet.</Body>}
      {canEdit ? <Button title={cur?.has_deck ? "Replace deck" : "Upload a PDF deck"} kind={cur?.has_deck ? "ghost" : "primary"} busy={busy === "deck"} disabled={busy === "links"} onPress={() => void pickDeck()} /> : null}
      {deckMsg ? <Notice kind={deckMsg.kind}>{deckMsg.text}</Notice> : null}

      <H2>Screenshots</H2>
      <Body muted>Up to {p.data.max_images} pictures of what you built: PNG, JPEG or WebP, 3 MB each. The first one is the cover on your project card.</Body>
      <Screenshots teamId={team} images={p.data.images} max={p.data.max_images} canEdit={canEdit} onChanged={p.reload} />

      <H2>Links and notes</H2>
      <View style={{ gap: 12 }}>
        <Field label="Video link" value={f.video_url} onChangeText={set("video_url")} editable={canEdit} placeholder="https://youtu.be/..." autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Body muted style={{ fontSize: 13 }}>A YouTube link plays right inside Kakushin for judges and visitors. Other links open in the browser.</Body>
        {cur?.video_embed && f.video_url === cur.video_url ? <Video embed={cur.video_embed} title={name ?? "Pitch"} /> : null}
        <Field label="GitHub repo (public)" value={f.repo_url} onChangeText={set("repo_url")} editable={canEdit} placeholder="https://github.com/your-team/project" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Body muted style={{ fontSize: 13 }}>Judges see who pushed code, matched by the GitHub link on each member's profile.</Body>
        <Field label="Demo link" value={f.demo_url} onChangeText={set("demo_url")} editable={canEdit} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Field label="Notes for the judges" value={f.notes} onChangeText={set("notes")} editable={canEdit} multiline maxLength={2000} />
      </View>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      {canEdit ? <Button title="Save pitch" busy={busy === "links"} disabled={busy === "deck" || form === null} onPress={() => void saveLinks()} /> : null}
    </Screen>
  );
}

/** The team's screenshots: add from the photo library, caption, move up or down, remove. */
function Screenshots({ teamId, images, max, canEdit, onChanged }: { teamId: string; images: MediaImage[]; max: number; canEdit: boolean; onChanged: () => Promise<unknown> }) {
  const t = useTheme();
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const base = `/teams/${teamId}/pitch/images`;
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true); setMsg(null);
    try { await fn(); await onChanged(); if (ok) setMsg({ kind: "ok", text: ok }); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); } finally { setBusy(false); }
  }
  const order = (list: MediaImage[]) => api(base, { method: "PUT", json: { images: list.map((m) => ({ id: m.id, caption: caps[m.id] ?? m.caption })) } });
  async function add() {
    const img = await pickImage().catch(() => null);
    if (img) await run(() => uploadImage(base, img), "Screenshot added");
  }
  function move(i: number, d: -1 | 1) {
    const list = [...images]; const [x] = list.splice(i, 1); list.splice(i + d, 0, x!);
    void run(() => order(list));
  }
  function remove(m: MediaImage) {
    Alert.alert("Remove this screenshot?", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => void run(() => api(`${base}/${m.id}`, { method: "DELETE" })) }]);
  }
  const dirty = images.some((m) => caps[m.id] !== undefined && caps[m.id] !== m.caption);
  return (
    <View style={{ gap: 10 }}>
      {images.length === 0 ? <Body muted>No screenshots yet. A project without them still shows fine.</Body> : null}
      {images.map((m, i) => (
        <View key={m.id} style={{ flexDirection: "row", gap: 12, alignItems: "center", borderWidth: 1.5, borderColor: t.ink, borderRadius: 14, padding: 10 }}>
          <View>
            <Image source={{ uri: abs(m.url)! }} style={{ width: 84, height: 63, borderRadius: 8, backgroundColor: t.sand }} />
            <Text style={{ position: "absolute", left: 5, top: 3, color: "#fff", fontFamily: F.monoMed, fontSize: 10, textShadowColor: "#000", textShadowRadius: 3 }}>{String(i + 1).padStart(2, "0")}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <TextInput accessibilityLabel={`Caption for screenshot ${i + 1}`} editable={canEdit} value={caps[m.id] ?? m.caption} onChangeText={(v) => setCaps({ ...caps, [m.id]: v })} maxLength={120} placeholder="Caption"
              placeholderTextColor={t.muted} style={{ color: t.ink, fontFamily: F.mono, fontSize: 14, borderBottomWidth: 1, borderColor: t.line, paddingVertical: 4 }} />
            {canEdit ? (
              <View style={{ flexDirection: "row", gap: 14 }}>
                {i > 0 ? <Small onPress={() => move(i, -1)}>Up</Small> : null}
                {i < images.length - 1 ? <Small onPress={() => move(i, 1)}>Down</Small> : null}
                <Small onPress={() => remove(m)} red>Remove</Small>
              </View>
            ) : null}
          </View>
        </View>
      ))}
      {canEdit && dirty ? <Button title="Save captions" kind="ghost" busy={busy} onPress={() => void run(() => order(images), "Captions saved")} /> : null}
      {canEdit && images.length < max ? <Button title={images.length ? "Add another screenshot" : "Add a screenshot"} kind="ghost" busy={busy} onPress={() => void add()} /> : null}
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
    </View>
  );
}

function Small({ children, onPress, red }: { children: string; onPress: () => void; red?: boolean }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}><Text style={{ fontFamily: F.monoMed, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, color: red ? t.redText : t.ink }}>{children}</Text></Pressable>;
}
