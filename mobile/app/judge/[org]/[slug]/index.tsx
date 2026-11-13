import React from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth";
import { judgeChallenge } from "../../../../lib/schemas";
import { useLoad } from "../../../../lib/useLoad";
import { useTheme } from "../../../../lib/theme";
import { Body, Card, Loading, Notice, Offline, Screen } from "../../../../components/ui";

/** The teams this judge scores: assigned ones only once the organiser uses assignments, never a conflict. */
export default function JudgeTeams() {
  const { org, slug } = useLocalSearchParams<{ org: string; slug: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const d = useLoad(() => api(`/judge/${org}/${slug}`, { schema: judgeChallenge }), [org, slug], { cache: me ? `judge.${me.id}.${org}.${slug}` : null });
  if (!d.data) return <Screen>{d.err ? <Notice kind="err">{d.err === "Not found" ? `This is only for judges invited with ${me?.email ?? "your email"}.` : d.err}</Notice> : <Loading />}</Screen>;
  const x = d.data, done = x.teams.filter((tm) => tm.done).length;
  return (
    <Screen onRefresh={d.refresh} refreshing={d.refreshing}>
      <Stack.Screen options={{ title: x.challenge.title }} />
      {d.stale ? <Offline /> : null}
      <Text style={{ color: t.ink, fontSize: 28, fontWeight: "900" }}>{done}/{x.teams.length} <Text style={{ fontSize: 16, fontWeight: "600" }}>teams scored</Text></Text>
      {!x.challenge.scoring_open ? <Body muted>Scoring opens when the organiser starts judging. You can look at the pitches now.</Body> : null}
      {x.challenge.blind ? <Body muted>Blind review: member names are hidden.</Body> : null}
      {x.teams.length === 0 ? <Body muted>No teams to judge yet.</Body> : null}
      {x.teams.map((tm) => (
        <Card key={tm.id} onPress={tm.own_team ? undefined : () => router.push({ pathname: "/judge/[org]/[slug]/[team]", params: { org, slug, team: tm.id, name: tm.name } } as never)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 17, fontWeight: "800" }}>{tm.name}</Text>
              <Body muted style={{ fontSize: 13 }}>{tm.own_team ? "Your team, so you cannot judge it" : tm.has_pitch ? "Pitch ready" : "No pitch yet"}</Body>
            </View>
            <Text style={{ color: tm.done ? t.moss : tm.partial ? t.gold : t.muted, fontWeight: "800" }}>{tm.done ? "Scored" : tm.partial ? "In progress" : "To score"}</Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
