import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { judgeChallenges } from "../../lib/schemas";
import { flush, queued } from "../../lib/judgeQueue";
import { useLoad } from "../../lib/useLoad";
import { useTheme } from "../../lib/theme";
import { Body, Card, Loading, Notice, Offline, Screen } from "../../components/ui";

/** Challenges this person judges. The tab only shows for people with judge invites (components/TabBar.tsx). */
export default function JudgeHome() {
  const { me } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const d = useLoad(() => api("/judge/challenges", { schema: judgeChallenges }), [me?.id], { cache: me ? `judge.${me.id}` : null });
  const [waiting, setWaiting] = useState(0);
  const [note, setNote] = useState("");
  useFocusEffect(useCallback(() => {
    if (!me) return;
    void (async () => {
      if ((await queued(me.id)).length) { const r = await flush(me.id); if (r.sent) setNote(`Sent ${r.sent} saved ${r.sent === 1 ? "score sheet" : "score sheets"}.`); if (r.failed.length) setNote(r.failed.map((f) => `${f.teamName}: ${f.error}`).join("\n")); }
      setWaiting((await queued(me.id)).length);
    })();
  }, [me?.id]));
  if (!me) return <Screen><Body muted>Sign in with the email your judging invite went to.</Body></Screen>;
  return (
    <Screen onRefresh={d.refresh} refreshing={d.refreshing}>
      {d.stale ? <Offline /> : null}
      {waiting ? <Notice kind="err">{waiting} score {waiting === 1 ? "sheet is" : "sheets are"} saved on this phone and will send when you are back online.</Notice> : null}
      {note ? <Notice kind="ok">{note}</Notice> : null}
      {!d.data ? (d.err ? <Notice kind="err">{d.err}</Notice> : <Loading />) : d.data.challenges.length === 0 ? <Body muted>You have no judging invites for {me.email}.</Body> : null}
      {d.data?.challenges.map((c) => (
        <Card key={`${c.oslug}/${c.slug}`} onPress={() => router.push(`/judge/${c.oslug}/${c.slug}`)}>
          <Text style={{ color: t.muted, fontSize: 13 }}>{c.oname}</Text>
          <Text style={{ color: t.ink, fontSize: 18, fontWeight: "800" }}>{c.title}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}><Body muted>{c.teams} {c.teams === 1 ? "team" : "teams"} to judge · {c.status === "judging" ? "scoring open" : "scoring not open yet"}</Body></View>
        </Card>
      ))}
    </Screen>
  );
}
