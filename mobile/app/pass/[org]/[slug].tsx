import React from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api } from "../../../lib/api";
import { checkinPass } from "../../../lib/schemas";
import { clock } from "../../../lib/format";
import { useLoad } from "../../../lib/useLoad";
import { useTheme } from "../../../lib/theme";
import { F } from "../../../lib/fonts";
import { Body, Loading, Notice, Offline, Screen } from "../../../components/ui";
import { Qr } from "../../../components/Qr";

/** The person's check-in pass. It is saved on the phone, so it still shows at a door with no signal. */
export default function PassScreen() {
  const { org, slug } = useLocalSearchParams<{ org: string; slug: string }>();
  const t = useTheme();
  const p = useLoad(() => api(`/orgs/${org}/challenges/${slug}/checkin/pass`, { schema: checkinPass }), [org, slug], { cache: `pass.${org}.${slug}` });
  return (
    <Screen onRefresh={p.refresh} refreshing={p.refreshing}>
      <Stack.Screen options={{ title: "Check-in pass" }} />
      {p.stale ? <Offline /> : null}
      {!p.data ? (p.err ? <Notice kind="err">{p.err}</Notice> : <Loading />)
        : !p.data.enabled || !p.data.code ? <Body muted>Check-in is not on for this challenge.</Body> : (
          <View style={{ alignItems: "center", gap: 14, paddingTop: 12 }}>
            <View style={{ padding: 12, backgroundColor: "#fff", borderRadius: 16 }}><Qr text={p.data.code} size={260} /></View>
            <Text style={{ color: t.ink, fontFamily: F.display, fontSize: 26 }}>{p.data.name}</Text>
            <Body muted>{p.data.team}</Body>
            {p.data.checked_in_at ? <Notice kind="ok">Checked in at {clock(p.data.checked_in_at)}</Notice> : <Body muted style={{ textAlign: "center" }}>Show this at the door. It only works for you, for this event. Turn your brightness up if the scanner struggles.</Body>}
          </View>
        )}
    </Screen>
  );
}
