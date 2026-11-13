import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../lib/api";
import { live } from "../../../lib/schemas";
import { clock, countdown } from "../../../lib/format";
import { useLoad } from "../../../lib/useLoad";
import { FILL, useTheme } from "../../../lib/theme";
import { F } from "../../../lib/fonts";
import { Body, Button, Card, H2, Label, Loading, Notice, Offline, Screen } from "../../../components/ui";

/** Event day: the current block, a big countdown, the submission cutoff and the latest messages. Refreshes every 30 seconds. */
export default function LiveScreen() {
  const { org, slug } = useLocalSearchParams<{ org: string; slug: string }>();
  const t = useTheme();
  const router = useRouter();
  const d = useLoad(async () => { const r = await api(`/orgs/${org}/challenges/${slug}/live`, { schema: live }); return { ...r, skew: r.now - Date.now() }; }, [org, slug], { cache: `live.${org}.${slug}` });
  const [, tick] = useState(0);
  useEffect(() => {
    const sec = setInterval(() => tick((n) => n + 1), 1000), poll = setInterval(() => void d.reload(), 30000);
    return () => { clearInterval(sec); clearInterval(poll); };
  }, [d.reload]);
  if (!d.data) return <Screen>{d.err ? <Notice kind="err">{d.err === "Not found" ? "We could not find that challenge." : d.err}</Notice> : <Loading />}</Screen>;
  const x = d.data;
  const now = Date.now() + (d.stale ? 0 : x.skew);
  const cur = x.agenda.find((b) => b.starts_at <= now && now < b.ends_at) ?? null;
  const next = x.agenda.find((b) => b.starts_at > now) ?? null;
  const due = x.challenge.pitch_due_at, closed = !!due && now >= due;
  const big = { color: t.ink, fontFamily: F.display, fontSize: 76, lineHeight: 82, fontVariant: ["tabular-nums" as const], textAlign: "center" as const };
  return (
    <Screen onRefresh={d.refresh} refreshing={d.refreshing}>
      <Stack.Screen options={{ title: "Live" }} />
      {d.stale ? <Offline /> : null}
      <Body muted>{x.challenge.title} · {x.challenge.org.name}</Body>
      <Card style={{ alignItems: "center", paddingVertical: 24 }}>
        {cur ? <><Label>Now: {cur.label}</Label><Text accessibilityLabel={`${countdown(cur.ends_at - now)} left`} style={big}>{countdown(cur.ends_at - now)}</Text><Body muted>until it ends at {clock(cur.ends_at)}</Body></>
          : next ? <><Label>Next: {next.label}</Label><Text style={big}>{countdown(next.starts_at - now)}</Text><Body muted>starts at {clock(next.starts_at)}</Body></>
          : <Body>{x.agenda.length ? "The agenda is over. Thanks for taking part." : "No agenda yet."}</Body>}
      </Card>
      {due ? (
        <View style={{ backgroundColor: closed ? FILL.red : "#111111", borderRadius: 16, padding: 16, alignItems: "center", gap: 4 }} accessibilityRole={closed ? "alert" : undefined}>
          {closed ? <Text style={{ color: "#fff", fontFamily: F.display, fontSize: 26 }}>Submissions closed</Text> : <>
            <Text style={{ color: "#BEB8AD", fontSize: 12, fontWeight: "700", letterSpacing: 1 }}>SUBMISSIONS CLOSE IN</Text>
            <Text style={{ color: "#fff", fontFamily: F.display, fontSize: 40, fontVariant: ["tabular-nums"] }}>{countdown(due - now)}</Text>
            <Text style={{ color: "#BEB8AD", fontSize: 14 }}>at {clock(due)}</Text></>}
        </View>
      ) : null}
      {x.me?.team && x.challenge.checkin_enabled ? (
        x.me.checked_in_at ? <Body muted>You checked in at {clock(x.me.checked_in_at)}.</Body>
          : <Button title="Show my check-in pass" kind="ghost" onPress={() => router.push(`/pass/${org}/${slug}`)} />
      ) : null}
      {x.agenda.length ? <>
        <H2>Agenda</H2>
        {x.agenda.map((b) => (
          <View key={b.id} style={{ flexDirection: "row", gap: 12, opacity: b.ends_at <= now ? 0.5 : 1 }}>
            <Text style={{ color: t.muted, fontSize: 14, width: 104 }}>{clock(b.starts_at)} to {clock(b.ends_at)}</Text>
            <Text style={{ color: b.id === cur?.id ? t.redText : t.ink, fontSize: 16, fontWeight: "700", flex: 1 }}>{b.label}</Text>
          </View>
        ))}
      </> : null}
      {x.messages.length ? <>
        <H2>Latest messages</H2>
        {x.messages.map((m) => <Card key={m.id}><Text style={{ color: t.ink, fontWeight: "800", fontSize: 16 }}>{m.title}</Text><Body muted style={{ fontSize: 13 }}>{clock(m.created_at)}</Body><Body>{m.body}</Body></Card>)}
      </> : null}
    </Screen>
  );
}
