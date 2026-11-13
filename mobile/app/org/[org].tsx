import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toSignIn } from "../../lib/nav";
import { follows as followsSchema, orgDetail, type ChallengeCard } from "../../lib/schemas";
import { fmtDate } from "../../lib/format";
import { F } from "../../lib/fonts";
import { useLoad } from "../../lib/useLoad";
import { shadow, useTheme } from "../../lib/theme";
import { Banner, Scrim } from "../../components/Banner";
import { OrgLogo } from "../../components/OrgLogo";
import { Body, Button, H2, Loading, Notice, Offline, Screen } from "../../components/ui";

const ORG_TYPE: Record<string, string> = { university: "University", hub: "Innovation hub", corporate: "Company", partner: "Development partner", other: "Organisation" };

/** An organisation's page: who they are, what is open now, what ran before, and a Follow button. */
export default function OrgScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const router = useRouter();
  const t = useTheme();
  const { me } = useAuth();
  const o = useLoad(() => api(`/orgs/${org}`, { schema: orgDetail }), [org], { cache: `org.${org}` });
  const fol = useLoad(async () => (me ? await api("/follows", { schema: followsSchema }) : null), [me?.id]);
  const [mine, setMine] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  const following = mine ?? !!fol.data?.orgs.some((x) => x.slug === org);

  async function toggle() {
    if (!me) { toSignIn(router, `/org/${org}`); return; }
    setMsg("");
    const next = !following;
    setMine(next);
    try { await api(`/follows/orgs/${org}`, { method: next ? "PUT" : "DELETE" }); }
    catch (e) { setMine(!next); setMsg((e as Error).message); }
  }

  const d = o.data;
  if (!d) {
    return <Screen><Stack.Screen options={{ title: "" }} />{o.err ? <Notice kind="err">{o.err === "Not found" ? "We could not find that organisation." : o.err}</Notice> : <Loading />}</Screen>;
  }
  const now = Date.now();
  const live = d.challenges.filter((c) => c.status === "open" && (!c.applications_close_at || c.applications_close_at > now));
  const past = d.challenges.filter((c) => !live.includes(c) && c.status !== "draft");

  return (
    <Screen onRefresh={() => { void o.refresh(); void fol.refresh(); }} refreshing={o.refreshing}>
      <Stack.Screen options={{ title: d.org.name }} />
      {o.stale ? <Offline /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <OrgLogo url={d.org.logo_url} name={d.org.name} size={72} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 26, lineHeight: 29 }}>{d.org.name}</Text>
          {d.org.type ? <Text style={{ color: t.muted, fontSize: 14, fontWeight: "600" }}>{ORG_TYPE[d.org.type] ?? d.org.type}</Text> : null}
        </View>
      </View>
      <Button title={following ? "Following" : "Follow"} kind={following ? "ghost" : "primary"} onPress={() => void toggle()} />
      <Body muted style={{ fontSize: 13 }}>{following ? "You get a note when they open a new challenge." : "Follow to get a note when they open a new challenge."}</Body>
      {msg ? <Notice kind="err">{msg}</Notice> : null}
      {d.org.website ? <Text accessibilityRole="link" onPress={() => void Linking.openURL(d.org.website!)} style={{ color: t.ink, textDecorationLine: "underline", fontSize: 15 }}>{d.org.website.replace(/^https?:\/\//, "")}</Text> : null}

      <H2>Open now</H2>
      {live.length === 0 ? <Body muted>Nothing open right now. Follow them to hear about the next one.</Body> : null}
      {live.map((c) => <OrgChallenge key={c.slug} c={c} onOpen={() => router.push(`/challenge/${org}/${c.slug}`)} />)}

      {past.length ? (
        <>
          <H2>Past challenges</H2>
          {past.map((c) => <OrgChallenge key={c.slug} c={c} past onOpen={() => router.push(`/challenge/${org}/${c.slug}`)} />)}
        </>
      ) : null}
    </Screen>
  );
}

function OrgChallenge({ c, past, onOpen }: { c: ChallengeCard & { results_published?: number }; past?: boolean; onOpen: () => void }) {
  const t = useTheme();
  const when = past
    ? (c.results_published ? "Results are out" : c.status === "judging" ? "Judging now" : c.status === "reviewing" ? "Reviewing applications" : "Closed")
    : (c.applications_close_at ? `Closes ${fmtDate(c.applications_close_at)}` : "No deadline");
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={c.title} style={({ pressed }) => [{ gap: 8 }, pressed && { opacity: 0.9 }]}>
      <View style={[{ borderRadius: 18 }, shadow(0.2)]}>
        <Banner url={c.cover_url} seed={c.slug} label={c.title} style={{ height: past ? 110 : 160, borderRadius: 18 }}>
          <Scrim height={80} />
          <Text style={{ position: "absolute", left: 14, right: 14, bottom: 12, color: "#fff", fontFamily: F.display, fontSize: past ? 18 : 22, lineHeight: past ? 21 : 25 }}>{c.title}</Text>
        </Banner>
      </View>
      <Text style={{ color: t.muted, fontSize: 14, fontWeight: "600", paddingHorizontal: 2 }}>{when}</Text>
    </Pressable>
  );
}
