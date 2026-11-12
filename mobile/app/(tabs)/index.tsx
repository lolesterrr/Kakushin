import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { challengeList, topics as topicsSchema } from "../../lib/schemas";
import { daysLeft, fmtDate, teamSize } from "../../lib/format";
import { useLoad } from "../../lib/useLoad";
import { useTheme } from "../../lib/theme";
import { Body, Card, Loading, Notice, Pill, Screen } from "../../components/ui";

export default function Explore() {
  const router = useRouter();
  const t = useTheme();
  const [topic, setTopic] = useState<string | null>(null);
  const topics = useLoad(() => api("/challenges/topics", { schema: topicsSchema }), []);
  const list = useLoad(() => api(`/challenges${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`, { schema: challengeList }), [topic]);

  return (
    <Screen onRefresh={list.refresh} refreshing={list.refreshing}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pill text="All" on={!topic} onPress={() => setTopic(null)} />
        {topics.data?.topics.map((x) => <Pill key={x} text={x} on={topic === x} onPress={() => setTopic(topic === x ? null : x)} />)}
      </View>
      {list.err ? <Notice kind="err">{list.err}</Notice> : null}
      {!list.data && !list.err ? <Loading /> : null}
      {list.data?.challenges.length === 0 ? <Body muted>No open challenges{topic ? ` in ${topic}` : ""} right now.</Body> : null}
      {list.data?.challenges.map((c) => {
        const d = daysLeft(c.applications_close_at);
        return (
          <Card key={`${c.org.slug}/${c.slug}`} onPress={() => router.push(`/challenge/${c.org.slug}/${c.slug}`)}>
            <Text style={{ color: t.muted, fontSize: 13 }}>{c.org.name}</Text>
            <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800" }}>{c.title}</Text>
            {c.summary ? <Body muted>{c.summary}</Body> : null}
            <Text style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>
              Teams of {teamSize(c.team_min, c.team_max)} · {d === null ? "No deadline" : d > 0 ? `${d} ${d === 1 ? "day" : "days"} left` : `Closed ${fmtDate(c.applications_close_at)}`}{c.prize ? ` · ${c.prize}` : ""}
            </Text>
          </Card>
        );
      })}
    </Screen>
  );
}
