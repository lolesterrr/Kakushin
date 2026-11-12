import React, { useState } from "react";
import { Platform, Text, View } from "react-native";
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
  const [form, setForm] = useState<{ video_url: string; demo_url: string; notes: string } | null>(null);
  const [busy, setBusy] = useState<"deck" | "links" | null>(null);
  const [deckMsg, setDeckMsg] = useState<Msg>(null);
  const [msg, setMsg] = useState<Msg>(null);

  if (!p.data) return <Screen>{p.err ? <Notice kind="err">{p.err === "Not found" ? "We could not find that team." : p.err}</Notice> : <Loading />}</Screen>;

  const cur = p.data.pitch;
  const f = form ?? { video_url: cur?.video_url ?? "", demo_url: cur?.demo_url ?? "", notes: cur?.notes ?? "" };
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

      <H2>Links and notes</H2>
      <View style={{ gap: 12 }}>
        <Field label="Video link" value={f.video_url} onChangeText={set("video_url")} editable={canEdit} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Field label="Demo or repo link" value={f.demo_url} onChangeText={set("demo_url")} editable={canEdit} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Field label="Notes for the judges" value={f.notes} onChangeText={set("notes")} editable={canEdit} multiline maxLength={2000} />
      </View>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      {canEdit ? <Button title="Save pitch" busy={busy === "links"} disabled={busy === "deck" || form === null} onPress={() => void saveLinks()} /> : null}
    </Screen>
  );
}
