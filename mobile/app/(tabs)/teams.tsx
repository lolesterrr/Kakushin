import React, { useEffect } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toSignIn } from "../../lib/nav";
import { syncReminders } from "../../lib/reminders";
import { myTeams } from "../../lib/schemas";
import { useLoad } from "../../lib/useLoad";
import { useTheme } from "../../lib/theme";
import { Body, Card, Loading, Notice, Offline, Screen, SignInCard, StatusStamp } from "../../components/ui";

const place = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

export default function Teams() {
  const { me } = useAuth();
  const router = useRouter();
  if (!me) {
    return (
      <Screen>
        <SignInCard title="Your teams live here" body="Sign in to start a team, join friends with an invite, and follow your application through to results." onSignIn={() => toSignIn(router, "/teams")} />
      </Screen>
    );
  }
  return <TeamList userId={me.id} />;
}

function TeamList({ userId }: { userId: string }) {
  const router = useRouter();
  const t = useTheme();
  const { data, err, stale, refresh, refreshing } = useLoad(() => api("/teams/mine", { schema: myTeams }), [userId], { cache: `teams.${userId}` });
  // Each fresh list resets this phone's deadline reminders, so they follow status changes and moved dates.
  useEffect(() => { if (data && !stale && !err) void syncReminders(data.teams); }, [data, stale, err]);
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      {err && !data ? <Notice kind="err">{err}</Notice> : null}
      {stale ? <Offline /> : null}
      {!data && !err ? <Loading /> : null}
      {data?.teams.length === 0 ? <Body muted>You are not in a team yet. Open a challenge in Explore to create or join one.</Body> : null}
      {data?.teams.map((x) => (
        <Card key={x.id} onPress={() => router.push(`/challenge/${x.oslug}/${x.cslug}`)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: t.muted, fontSize: 13 }}>{x.oname}</Text>
              <Text style={{ color: t.ink, fontSize: 18, fontWeight: "800" }}>{x.title}</Text>
              <Body muted>{x.name}{x.status === "winner" && x.placement ? ` · ${place(x.placement)} place` : ""}</Body>
            </View>
            <StatusStamp status={x.status} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
