import React from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { inbox } from "../../lib/schemas";
import { fmtDate } from "../../lib/format";
import { useLoad } from "../../lib/useLoad";
import { useTheme } from "../../lib/theme";
import { Body, Card, Loading, Notice, Screen } from "../../components/ui";

/** Links from the Worker are web paths. Map the ones the app has a screen for. */
function target(link: string): string | null {
  const m = /^\/o\/([^/]+)\/c\/([^/]+)/.exec(link);
  if (m) return `/challenge/${m[1]}/${m[2]}`;
  if (link.startsWith("/profile")) return "/profile";
  return null;
}

export default function Inbox() {
  const router = useRouter();
  const t = useTheme();
  const { data, err, refresh, refreshing } = useLoad(async () => {
    const r = await api("/inbox", { schema: inbox });
    if (r.unread > 0) void api("/inbox/read", { method: "POST" }).catch(() => {});
    return r;
  }, []);
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      {err ? <Notice kind="err">{err}</Notice> : null}
      {!data && !err ? <Loading /> : null}
      {data?.items.length === 0 ? <Body muted>Nothing yet. You get a note here when results come out, and when an organisation you follow opens a new challenge.</Body> : null}
      {data?.items.map((n) => {
        const to = target(n.link);
        return (
          <Card key={n.id} onPress={to ? () => router.push(to as never) : undefined} style={n.read_at ? undefined : { borderLeftWidth: 4, borderLeftColor: "#c8321f" }}>
            <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700" }}>{n.title}</Text>
            {n.body ? <Body muted>{n.body}</Body> : null}
            <Text style={{ color: t.muted, fontSize: 12 }}>{fmtDate(n.created_at)}</Text>
          </Card>
        );
      })}
    </Screen>
  );
}
