import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toSignIn } from "../lib/nav";
import { savedList } from "../lib/schemas";
import { fmtDate } from "../lib/format";
import { F } from "../lib/fonts";
import { useLoad } from "../lib/useLoad";
import { useTheme } from "../lib/theme";
import { EventTile } from "../components/events";
import { Body, Card, H2, Label, Loading, Notice, Offline, Screen, SignInCard } from "../components/ui";

/** Everything bookmarked: challenges on Kakushin and global events. Kept on the phone too, so it opens with no signal. */
export default function Saved() {
  const { me } = useAuth();
  const router = useRouter();
  if (!me) return <Screen><SignInCard title="Keep the good ones" body="Sign in to save challenges and global events, and get a reminder before they close." onSignIn={() => toSignIn(router, "/saved")} /></Screen>;
  return <SavedList userId={me.id} />;
}

function SavedList({ userId }: { userId: string }) {
  const router = useRouter();
  const t = useTheme();
  const { data, err, stale, refresh, refreshing } = useLoad(() => api("/saved", { schema: savedList }), [userId], { cache: `saved.${userId}` });
  const none = data && data.challenges.length === 0 && data.events.length === 0;
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      {err && !data ? <Notice kind="err">{err}</Notice> : null}
      {stale ? <Offline /> : null}
      {!data && !err ? <Loading /> : null}
      {none ? <Body muted>Nothing saved yet. Open a challenge or a global event and tap the bookmark. You get a reminder three days and one day before a saved one closes.</Body> : null}
      {data && data.challenges.length ? <H2>Challenges</H2> : null}
      {data?.challenges.map((c) => (
        <Card key={`${c.org.slug}/${c.slug}`} onPress={() => router.push(`/challenge/${c.org.slug}/${c.slug}`)}>
          <Label>{c.org.name}</Label>
          <Text style={{ color: t.ink, fontSize: 19, fontFamily: F.display }}>{c.title}</Text>
          <Body muted>{c.status === "open" ? (c.applications_close_at ? `Closes ${fmtDate(c.applications_close_at)}` : "Open, no deadline") : c.results_published ? "Results are out" : "Applications closed"}</Body>
        </Card>
      ))}
      {data && data.events.length ? <H2>Global events</H2> : null}
      <View style={{ gap: 26 }}>
        {data?.events.map((e, i) => <EventTile key={e.slug} e={e} i={i} onOpen={() => router.push(`/event/${e.slug}`)} />)}
      </View>
    </Screen>
  );
}
