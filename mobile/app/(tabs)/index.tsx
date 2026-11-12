import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { challengeList, topics as topicsSchema, type ChallengeCard } from "../../lib/schemas";
import { daysLeft, fmtDate, teamSize } from "../../lib/format";
import { F } from "../../lib/fonts";
import { useLoad } from "../../lib/useLoad";
import { shadow, useTheme } from "../../lib/theme";
import { Banner, Scrim } from "../../components/Banner";
import { Body, DaysStamp, Hand, Loading, Notice, Pill, Screen } from "../../components/ui";
import { SafeAreaView } from "react-native-safe-area-context";

const TILTS = [3, -2, 2];
const FILLS = ["#c8321f", "#2f4f8f", "#2f4f8f"];

function ChallengeTile({ c, i, onOpen }: { c: ChallengeCard; i: number; onOpen: () => void }) {
  const t = useTheme();
  const d = daysLeft(c.applications_close_at);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${c.title} by ${c.org.name}`} style={({ pressed }) => [{ gap: 12 }, pressed && { opacity: 0.9 }]}>
      <View style={[{ borderRadius: 20 }, shadow(0.3)]}>
        <Banner url={c.cover_url} seed={c.slug} label={c.title} style={{ height: 218, borderRadius: 20 }}>
          <Scrim height={120} />
          {d !== null && d > 0 ? <View style={{ position: "absolute", top: 14, right: 14 }}><DaysStamp days={d} fill={d <= 7 ? FILLS[0] : FILLS[1]} tilt={TILTS[i % 3]!} /></View> : null}
          <View style={{ position: "absolute", left: 16, right: 16, bottom: 14, gap: 3 }}>
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" }}>{c.org.name}</Text>
            <Text style={{ color: "#fff", fontFamily: F.display, fontSize: 26, lineHeight: 28 }}>{c.title}</Text>
          </View>
        </Banner>
      </View>
      <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600", paddingHorizontal: 2 }}>
        {d === null ? "No deadline" : d > 0 ? `Closes ${fmtDate(c.applications_close_at)}` : `Closed ${fmtDate(c.applications_close_at)}`}  ·  Teams of {teamSize(c.team_min, c.team_max)}{c.prize ? <Text style={{ color: t.redText }}>  ·  {c.prize}</Text> : null}
      </Text>
    </Pressable>
  );
}

export default function Explore() {
  const router = useRouter();
  const t = useTheme();
  const { me } = useAuth();
  const [topic, setTopic] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const topics = useLoad(() => api("/challenges/topics", { schema: topicsSchema }), []);
  const list = useLoad(() => api(`/challenges${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`, { schema: challengeList }), [topic]);
  const first = (me?.name ?? me?.email ?? "").split(/[ @]/)[0] ?? "";
  const initials = (me?.name ?? me?.email ?? "?").split(/[ @.]/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");
  const shown = (list.data?.challenges ?? []).filter((c) => !q.trim() || `${c.title} ${c.org.name} ${c.topics.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Screen onRefresh={list.refresh} refreshing={list.refreshing} scroll>
      <SafeAreaView edges={["top"]} style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#D93A2B" }} />
            <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>Kakushin</Text>
          </View>
          <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Your profile" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: t.bg, fontSize: 15, fontWeight: "700" }}>{initials}</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 10 }}><Hand>{first ? `Hi ${first},` : "Hi,"}</Hand></View>
        <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 36, lineHeight: 37, letterSpacing: -0.8 }}>Find your next{"\n"}hackathon.</Text>
      </SafeAreaView>

      <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, height: 54, paddingHorizontal: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 27 }, shadow(0.08)]}>
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={t.ink} strokeWidth={2.4} strokeLinecap="round"><Circle cx={9} cy={9} r={6} /><Path d="M14 14l4 4" /></Svg>
        <TextInput accessibilityLabel="Search challenges" value={q} onChangeText={setQ} placeholder="Search by name, topic or organiser" placeholderTextColor={t.muted} returnKeyType="search" style={{ flex: 1, color: t.ink, fontSize: 16, paddingVertical: 0 }} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pill text="All" on={!topic} onPress={() => setTopic(null)} />
        {topics.data?.topics.map((x) => <Pill key={x} text={x} on={topic === x} onPress={() => setTopic(topic === x ? null : x)} />)}
      </View>

      {list.err ? <Notice kind="err">{list.err}</Notice> : null}
      {!list.data && !list.err ? <Loading /> : null}
      {list.data && shown.length === 0 ? <Body muted>{q ? "Nothing matches that search." : `No open challenges${topic ? ` in ${topic}` : ""} right now.`}</Body> : null}
      <View style={{ gap: 26 }}>
        {shown.map((c, i) => <ChallengeTile key={`${c.org.slug}/${c.slug}`} c={c} i={i} onOpen={() => router.push(`/challenge/${c.org.slug}/${c.slug}`)} />)}
      </View>
    </Screen>
  );
}

