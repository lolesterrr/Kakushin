import React, { useState } from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import { F } from "../lib/fonts";
import { abs, pickImage, uploadImage } from "../lib/media";
import { photos as photosSchema, type ProjectCard } from "../lib/schemas";
import { useLoad } from "../lib/useLoad";
import { FILL, useTheme } from "../lib/theme";
import { Body, Button, H2, Label, Notice } from "./ui";
import { NoCover } from "./media";

export const placeLabel = (p: Pick<ProjectCard, "status" | "placement">) => (p.status === "winner" ? (p.placement === 1 ? "1st place" : p.placement === 2 ? "2nd place" : p.placement === 3 ? "3rd place" : "Winner") : "Finalist");

/** Project cards: the first screenshot as the cover (stripes when there is none), the place, and who built it. */
export function ProjectCards({ items }: { items: ProjectCard[] }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ gap: 18 }}>
      {items.map((p) => (
        <Pressable key={p.id} accessibilityRole="link" onPress={() => router.push(`/project/${p.oslug}/${p.cslug}/${p.id}` as never)} style={({ pressed }) => [{ gap: 6 }, pressed && { opacity: 0.85 }]}>
          {p.cover_url ? <Image source={{ uri: abs(p.cover_url)! }} accessibilityIgnoresInvertColors style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12, borderWidth: 1.5, borderColor: t.ink, backgroundColor: t.sand }} />
            : <NoCover label="No pictures yet" />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ borderWidth: 1, borderColor: p.status === "winner" ? FILL.red : t.ink, backgroundColor: p.status === "winner" ? FILL.red : "transparent", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
              <Text style={{ fontFamily: F.monoMed, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: p.status === "winner" ? "#fff" : t.ink }}>{placeLabel(p)}</Text>
            </View>
            {p.video_embed || p.video_url ? <Text style={{ fontFamily: F.mono, fontSize: 11, color: t.muted }}>VIDEO</Text> : null}
          </View>
          <Text style={{ color: t.ink, fontFamily: F.display, fontSize: 19 }}>{p.team}</Text>
          {p.members ? <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={1}>{p.members}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Photos from the event, once judging starts. Everyone sees approved photos; participants can add a few of their
 * own, which wait for an organiser; organisers approve or remove. Shows nothing at all when there are no photos and
 * the person cannot add any.
 */
export function Recap({ base }: { base: string }) {
  const t = useTheme();
  const d = useLoad(() => api(`${base}/photos`, { schema: photosSchema }), [base]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  if (!d.data || !d.data.open) return null;
  const x = d.data;
  if (!x.photos.length && !x.can_add) return null;
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true); setMsg(null);
    try { await fn(); await d.reload(); if (ok) setMsg({ kind: "ok", text: ok }); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); } finally { setBusy(false); }
  }
  async function add() {
    const img = await pickImage().catch(() => null);
    if (!img) return;
    await run(async () => { await uploadImage(`${base}/photos`, img, { caption }); setCaption(""); }, x.can_manage ? "Photo added" : "Photo sent. It shows once an organiser approves it.");
  }
  function manage(id: string, approved: boolean) {
    if (!x.can_manage) return;
    Alert.alert("This photo", undefined, [
      ...(!approved ? [{ text: "Approve", onPress: () => void run(() => api(`${base}/photos/${id}`, { method: "PUT", json: { approved: true } })) }] : []),
      { text: "Remove", style: "destructive" as const, onPress: () => void run(() => api(`${base}/photos/${id}`, { method: "DELETE" })) },
      { text: "Cancel", style: "cancel" as const },
    ]);
  }
  return (
    <View style={{ gap: 10 }}>
      <H2>From the event</H2>
      {x.photos.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {x.photos.map((p, i) => (
            <Pressable key={p.id} disabled={!x.can_manage} onPress={() => manage(p.id, p.approved)} style={{ width: "48.5%", gap: 3 }}>
              <Image source={{ uri: abs(p.url)! }} accessibilityLabel={p.caption || `Event photo ${i + 1}`} style={{ width: "100%", aspectRatio: 1, borderRadius: 8, borderWidth: 1.5, borderColor: p.approved ? t.ink : FILL.gold, opacity: p.approved ? 1 : 0.6, backgroundColor: t.sand }} />
              <Text style={{ fontFamily: F.mono, fontSize: 10, color: t.muted }}>{String(i + 1).padStart(2, "0")}{p.approved ? "" : " · WAITING"}</Text>
              {p.caption ? <Text style={{ fontFamily: F.hand, fontSize: 17, color: t.ink }} numberOfLines={2}>{p.caption}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : <Body muted>No photos yet.</Body>}
      {x.can_add ? (
        <View style={{ gap: 8 }}>
          <Label>Add a photo from the day</Label>
          <TextInput value={caption} onChangeText={setCaption} maxLength={120} placeholder="Caption (optional)" placeholderTextColor={t.muted}
            style={{ borderWidth: 1.5, borderColor: t.ink, borderLeftWidth: 4, borderLeftColor: t.red, backgroundColor: t.ledger, color: t.ink, fontFamily: F.mono, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10 }} />
          <Button title="Choose a photo" kind="ghost" busy={busy} onPress={() => void add()} />
          {!x.can_manage ? <Body muted style={{ fontSize: 13 }}>Up to {x.per_person} photos each. They show once an organiser approves them.</Body> : null}
        </View>
      ) : null}
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
    </View>
  );
}
