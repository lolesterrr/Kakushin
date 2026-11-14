import React, { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toSignIn } from "../../lib/nav";
import { eventList, topics as topicsSchema, type EventCard } from "../../lib/schemas";
import { F, topicLabel } from "../../lib/fonts";
import { useLoad } from "../../lib/useLoad";
import { useTheme } from "../../lib/theme";
import { EventTile } from "../../components/events";
import { Body, Button, Hand, Label, Loading, Notice, Offline, Pill, Screen } from "../../components/ui";

/** Global events: hackathons and opportunities from outside Kakushin. Each one opens a page with its official link. */
export default function Global() {
  const router = useRouter();
  const t = useTheme();
  const { me } = useAuth();
  const [topic, setTopic] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { const h = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(h); }, [q]);
  const topics = useLoad(() => api("/challenges/topics", { schema: topicsSchema }), [], { cache: "topics" });
  const qs = (cursor?: string) => {
    const u = new URLSearchParams({ limit: "30" });
    if (topic) u.set("topic", topic);
    if (query) u.set("q", query);
    if (online) u.set("online", "1");
    if (cursor) u.set("cursor", cursor);
    return u.toString();
  };
  const list = useLoad(() => api(`/events?${qs()}`, { schema: eventList }), [topic, query, online], { cache: query ? undefined : `global.${topic ?? "all"}.${online ? "online" : "any"}` });
  // Older pages are added under the first one, and dropped whenever the filters change.
  const [more, setMore] = useState<{ events: EventCard[]; next: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setMore(null); setErr(""); }, [topic, query, online, list.data]);
  const events = [...(list.data?.events ?? []), ...(more?.events ?? [])];
  const next = more ? more.next : list.data?.next ?? null;
  async function loadMore() {
    if (!next) return;
    setBusy(true); setErr("");
    try { const r = await api(`/events?${qs(next)}`, { schema: eventList }); setMore({ events: [...(more?.events ?? []), ...r.events], next: r.next ?? null }); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Screen onRefresh={list.refresh} refreshing={list.refreshing} scroll>
      <SafeAreaView edges={["top"]} style={{ gap: 6 }}>
        <Hand>From around the world</Hand>
        <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 36, lineHeight: 37, letterSpacing: -0.8 }}>Global events.</Text>
        <Body muted>Hackathons and opportunities from outside Kakushin. We do not run these: each one links to its official page.</Body>
      </SafeAreaView>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, height: 52, paddingHorizontal: 14, backgroundColor: t.ledger, borderWidth: 1.5, borderColor: t.ink, borderLeftWidth: 4, borderLeftColor: t.red }}>
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={t.ink} strokeWidth={2.4} strokeLinecap="round"><Circle cx={9} cy={9} r={6} /><Path d="M14 14l4 4" /></Svg>
        <TextInput accessibilityLabel="Search global events" value={q} onChangeText={setQ} placeholder="Search by name, organiser or place" placeholderTextColor={t.muted} returnKeyType="search" style={{ flex: 1, color: t.ink, fontSize: 15, fontFamily: F.mono, paddingVertical: 0 }} />
      </View>
      <View style={{ gap: 8 }}>
        <Label>Topic</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          <Pill text="All" on={!topic} onPress={() => setTopic(null)} />
          <Pill text="Online" on={online} onPress={() => setOnline(!online)} />
          {topics.data?.topics.map((x) => <Pill key={x} text={topicLabel(x)} on={topic === x} onPress={() => setTopic(topic === x ? null : x)} />)}
        </ScrollView>
      </View>

      {list.err && !list.data ? <Notice kind="err">{list.err}</Notice> : null}
      {list.stale ? <Offline /> : null}
      {!list.data && !list.err ? <Loading /> : null}
      {list.data && events.length === 0 ? <Body muted>{q || topic || online ? "No global events match. Try fewer filters." : "No global events are listed right now. Know a good one? Suggest it below."}</Body> : null}
      <View style={{ gap: 26 }}>
        {events.map((e, i) => <EventTile key={e.slug} e={e} i={i} onOpen={() => router.push(`/event/${e.slug}`)} />)}
      </View>
      {err ? <Notice kind="err">{err}</Notice> : null}
      {next ? <Button title="Show more" kind="ghost" busy={busy} onPress={() => void loadMore()} /> : null}
      <View style={{ marginTop: 12, gap: 8 }}>
        <Button title="Suggest an event" kind="ghost" onPress={() => (me ? router.push("/suggest-event") : toSignIn(router, "/suggest-event"))} />
        <Body muted style={{ fontSize: 13 }}>Found a hackathon others should see? Send it in and our team checks it before it is listed.</Body>
      </View>
    </Screen>
  );
}
