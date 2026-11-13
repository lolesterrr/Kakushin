import React, { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toSignIn } from "../../lib/nav";
import { invitePreview } from "../../lib/schemas";
import { F } from "../../lib/fonts";
import { useLoad } from "../../lib/useLoad";
import { useTheme } from "../../lib/theme";
import { OrgLogo } from "../../components/OrgLogo";
import { Body, Button, Card, Hand, Loading, Notice, Screen } from "../../components/ui";

/** Where an invite link lands (kakushin://join/CODE or https://…/join/CODE): see the team, then join with one tap. */
export default function Join() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = (raw ?? "").toUpperCase();
  const router = useRouter();
  const t = useTheme();
  const { me } = useAuth();
  const p = useLoad(() => api(`/teams/preview/${encodeURIComponent(code)}`, { schema: invitePreview }), [code]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function join() {
    if (!me) { toSignIn(router, `/join/${code}`); return; }
    setBusy(true); setErr("");
    try {
      const r = await api<{ org: string; challenge: string }>("/teams/join", { method: "POST", json: { code } });
      router.replace(`/challenge/${r.org}/${r.challenge}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  const x = p.data?.team;
  const full = !!x && x.size >= x.team_max;
  const closed = !!x && x.status !== "forming";
  return (
    <Screen>
      <Stack.Screen options={{ title: "Team invite" }} />
      {p.err ? <Notice kind="err">{p.err}</Notice> : null}
      {!x && !p.err ? <Loading /> : null}
      {x ? (
        <>
          <Hand>You're invited</Hand>
          <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 32, lineHeight: 35 }}>Join {x.name}</Text>
          <Card onPress={() => router.push(`/challenge/${x.oslug}/${x.cslug}`)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <OrgLogo url={x.logo_url} name={x.oname} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 17, fontWeight: "800" }}>{x.title}</Text>
                <Body muted>by {x.oname}</Body>
              </View>
            </View>
          </Card>
          <Body muted>{x.size} of {x.team_max} places taken.</Body>
          {closed ? <Notice kind="err">This team has already applied, so it is closed to new members.</Notice> : null}
          {!closed && full ? <Notice kind="err">This team is full.</Notice> : null}
          {err ? <Notice kind="err">{err}</Notice> : null}
          {!closed && !full ? <Button title={me ? "Join this team" : "Sign in to join"} busy={busy} onPress={() => void join()} /> : null}
          <Button title="See the challenge" kind="ghost" onPress={() => router.push(`/challenge/${x.oslug}/${x.cslug}`)} />
        </>
      ) : null}
    </Screen>
  );
}
