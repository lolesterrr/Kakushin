import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { myTeams } from "../../lib/schemas";
import { useLoad } from "../../lib/useLoad";
import { useTheme } from "../../lib/theme";
import { Body, Card, Loading, Notice, Screen, StatusStamp } from "../../components/ui";

export default function Teams() {
  const router = useRouter();
  const t = useTheme();
  const { data, err, refresh, refreshing } = useLoad(() => api("/teams/mine", { schema: myTeams }), []);
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      {err ? <Notice kind="err">{err}</Notice> : null}
      {!data && !err ? <Loading /> : null}
      {data?.teams.length === 0 ? <Body muted>You are not in a team yet. Open a challenge in Explore to create or join one.</Body> : null}
      {data?.teams.map((x) => (
        <Card key={x.id} onPress={() => router.push(`/challenge/${x.oslug}/${x.cslug}`)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: t.muted, fontSize: 13 }}>{x.oname}</Text>
              <Text style={{ color: t.ink, fontSize: 18, fontWeight: "800" }}>{x.title}</Text>
              <Body muted>{x.name}</Body>
            </View>
            <StatusStamp status={x.status} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
