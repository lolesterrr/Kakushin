import React from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { challengeDetail, publicResults, teamResponse } from "../../../lib/schemas";
import { F } from "../../../lib/fonts";
import { useLoad } from "../../../lib/useLoad";
import { FILL, shadow, useTheme } from "../../../lib/theme";
import { Banner, Scrim } from "../../../components/Banner";
import { Body, H2, Loading, Notice, Offline, Screen } from "../../../components/ui";

const place = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
const MEDAL = [FILL.red, FILL.gold, FILL.indigo];

/** Results in the app: the winners in order, the other finalists, and where your own team landed. */
export default function Results() {
  const { org, slug } = useLocalSearchParams<{ org: string; slug: string }>();
  const router = useRouter();
  const t = useTheme();
  const { me } = useAuth();
  const base = `/orgs/${org}/challenges/${slug}`;
  const ch = useLoad(async () => (await api(base, { schema: challengeDetail })).challenge, [base], { cache: `challenge.${org}.${slug}` });
  const res = useLoad(() => api(`${base}/public-results`, { schema: publicResults }), [base], { cache: `results.${org}.${slug}` });
  const tm = useLoad(async () => (me ? (await api(`${base}/team`, { schema: teamResponse })).team : null), [base, me?.id]);

  const c = ch.data, r = res.data, team = tm.data;
  const refresh = async () => { await Promise.all([ch.refresh(), res.refresh(), tm.refresh()]); };
  if (!c || !r) {
    const err = ch.err || res.err;
    return <Screen><Stack.Screen options={{ title: "Results" }} />{err ? <Notice kind="err">{err}</Notice> : <Loading />}</Screen>;
  }

  return (
    <Screen onRefresh={refresh} refreshing={res.refreshing}>
      <Stack.Screen options={{ title: "Results" }} />
      {res.stale ? <Offline /> : null}
      <View style={[{ borderRadius: 20 }, shadow(0.25)]}>
        <Banner url={c.cover_url} seed={c.slug} label={c.title} style={{ height: 150, borderRadius: 20 }}>
          <Scrim height={90} />
          <View style={{ position: "absolute", left: 16, right: 16, bottom: 12 }}>
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" }}>{c.org.name}</Text>
            <Text style={{ color: "#fff", fontFamily: F.display, fontSize: 22, lineHeight: 25 }}>{c.title}</Text>
          </View>
        </Banner>
      </View>

      {!r.published ? <Body muted>The organisers have not published results yet. You get a note in your inbox the moment they do.</Body> : null}

      {r.published && team ? <YourPlace status={team.status} placement={team.placement ?? null} name={team.name} onCertificate={() => router.push("/profile")} /> : null}

      {r.winners.length ? <H2>Winners</H2> : null}
      {r.winners.map((w, i) => (
        <View key={`${w.placement}-${w.team}`} style={[{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, padding: 14 }, shadow(0.08)]}>
          <View accessible accessibilityLabel={w.placement ? `${place(w.placement)} place` : "Winner"} style={{ width: 62, paddingVertical: 8, alignItems: "center", backgroundColor: MEDAL[i] ?? FILL.ink, borderWidth: 2, borderStyle: "dashed", borderColor: "#ffffffaa", transform: [{ rotate: `${i % 2 ? 2 : -2}deg` }] }}>
            <Text style={{ color: "#fff", fontFamily: F.display, fontSize: 20 }}>{w.placement ? place(w.placement) : "Won"}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.ink, fontSize: 18, fontWeight: "800" }}>{w.team}</Text>
            {w.members ? <Body muted style={{ fontSize: 14 }}>{w.members}</Body> : null}
          </View>
        </View>
      ))}

      {r.finalists.length ? (
        <>
          <H2>Finalists</H2>
          <Body muted>{r.finalists.join(", ")}</Body>
        </>
      ) : null}
    </Screen>
  );
}

function YourPlace({ status, placement, name, onCertificate }: { status: string; placement: number | null; name: string; onCertificate: () => void }) {
  const t = useTheme();
  const won = status === "winner";
  const line = won ? (placement ? `${name} placed ${place(placement)}.` : `${name} won.`)
    : status === "finalist" ? `${name} made the final.`
    : status === "shortlisted" ? `${name} was shortlisted.`
    : `${name} took part. Thank you for applying.`;
  const ink = won ? "#ffffff" : t.onBand;
  return (
    <View style={{ backgroundColor: won ? FILL.red : t.band, borderRadius: 20, padding: 18, gap: 8 }}>
      <Text style={{ fontFamily: F.hand, fontSize: 22, color: won ? "#ffe1d6" : "#ee7b69" }}>{won ? "Congratulations" : "Your team"}</Text>
      <Text style={{ color: ink, fontFamily: F.display, fontSize: 24, lineHeight: 28 }}>{line}</Text>
      <Pressable onPress={onCertificate} accessibilityRole="button" style={({ pressed }) => [{ marginTop: 6, minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: ink, alignItems: "center", justifyContent: "center" }, pressed && { opacity: 0.8 }]}>
        <Text style={{ color: ink, fontSize: 16, fontWeight: "700" }}>Your certificates</Text>
      </Pressable>
    </View>
  );
}
