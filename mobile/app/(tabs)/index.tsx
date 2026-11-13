import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { challengeList, follows as followsSchema, topics as topicsSchema, type ChallengeCard } from "../../lib/schemas";
import { loadPrefs, markOnboarded, onboarded } from "../../lib/prefs";
import { forYou } from "../../lib/rank";
import { toSignIn } from "../../lib/nav";
import { daysLeft, fmtDate, teamSize } from "../../lib/format";
import { F } from "../../lib/fonts";
import { useLoad } from "../../lib/useLoad";
import { shadow, useTheme } from "../../lib/theme";
import { Banner, Scrim } from "../../components/Banner";
import { Body, DaysStamp, H2, Hand, Loading, Notice, Offline, Pill, Screen } from "../../components/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { RedLight } from "../../components/RedLight";

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

/** A smaller card for the "For you" row. */
function ForYouCard({ c, onOpen }: { c: ChallengeCard; onOpen: () => void }) {
  const t = useTheme();
  const d = daysLeft(c.applications_close_at);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${c.title} by ${c.org.name}`} style={({ pressed }) => [{ width: 230, gap: 6 }, pressed && { opacity: 0.9 }]}>
      <View style={[{ borderRadius: 16 }, shadow(0.2)]}>
        <Banner url={c.cover_url} seed={c.slug} label={c.title} style={{ height: 130, borderRadius: 16 }}>
          <Scrim height={80} />
          <Text numberOfLines={2} style={{ position: "absolute", left: 12, right: 12, bottom: 10, color: "#fff", fontFamily: F.display, fontSize: 17, lineHeight: 20 }}>{c.title}</Text>
        </Banner>
      </View>
      <Text numberOfLines={1} style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>{c.org.name}{d !== null && d > 0 ? `  ·  ${d} ${d === 1 ? "day" : "days"} left` : ""}</Text>
    </Pressable>
  );
}

export default function Explore() {
  const router = useRouter();
  const t = useTheme();
  const { me } = useAuth();
  const [topic, setTopic] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const topics = useLoad(() => api("/challenges/topics", { schema: topicsSchema }), [], { cache: "topics" });
  const list = useLoad(() => api(`/challenges${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`, { schema: challengeList }), [topic], { cache: `explore.${topic ?? "all"}` });
  // The topics behind "For you": the account's when signed in, otherwise the ones picked during onboarding.
  const mine = useLoad(async () => (me ? (await api("/follows", { schema: followsSchema })).topics : (await loadPrefs()).topics), [me?.id]);
  const suggested = !topic && !q.trim() ? forYou(list.data?.challenges ?? [], mine.data ?? []) : [];

  // First run goes through onboarding, unless a signed-in person already follows topics.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (await onboarded()) return;
      if (me) {
        const f = await api("/follows", { schema: followsSchema }).catch(() => null);
        if (f && (f.topics.length || f.orgs.length)) { await markOnboarded(); return; }
      }
      if (alive) router.push("/welcome");
    })();
    return () => { alive = false; };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = (me?.name ?? me?.email ?? "").split(/[ @]/)[0] ?? "";
  const initials = (me?.name ?? me?.email ?? "?").split(/[ @.]/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");
  const shown = (list.data?.challenges ?? []).filter((c) => !q.trim() || `${c.title} ${c.org.name} ${c.topics.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Screen onRefresh={list.refresh} refreshing={list.refreshing} scroll>
      <SafeAreaView edges={["top"]} style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <RedLight size={12} />
            <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>Kakushin</Text>
          </View>
          {me ? (
            <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Your profile" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.ink, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: t.bg, fontSize: 15, fontWeight: "700" }}>{initials}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => toSignIn(router)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, borderColor: t.ink, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: "700" }}>Sign in</Text>
            </Pressable>
          )}
        </View>
        <View style={{ marginTop: 10 }}><Hand>{first ? `Hi ${first},` : me ? "Hi," : "Welcome,"}</Hand></View>
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

      {list.err && !list.data ? <Notice kind="err">{list.err}</Notice> : null}
      {list.stale ? <Offline /> : null}
      {suggested.length ? (
        <View style={{ gap: 10 }}>
          <H2>For you</H2>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
            {suggested.map((c) => <ForYouCard key={`${c.org.slug}/${c.slug}`} c={c} onOpen={() => router.push(`/challenge/${c.org.slug}/${c.slug}`)} />)}
          </ScrollView>
          <H2>All challenges</H2>
        </View>
      ) : null}
      {!list.data && !list.err ? <Loading /> : null}
      {list.data && shown.length === 0 ? <Body muted>{q ? "Nothing matches that search." : `No open challenges${topic ? ` in ${topic}` : ""} right now.`}</Body> : null}
      <View style={{ gap: 26 }}>
        {shown.map((c, i) => <ChallengeTile key={`${c.org.slug}/${c.slug}`} c={c} i={i} onOpen={() => router.push(`/challenge/${c.org.slug}/${c.slug}`)} />)}
      </View>
    </Screen>
  );
}

