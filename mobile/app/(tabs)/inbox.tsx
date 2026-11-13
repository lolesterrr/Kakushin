import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toSignIn } from "../../lib/nav";
import { inbox, type InboxItem } from "../../lib/schemas";
import { fmtDate } from "../../lib/format";
import { appRoute } from "../../lib/links";
import { useLoad } from "../../lib/useLoad";
import { useTheme } from "../../lib/theme";
import { Body, Button, Card, Loading, Notice, Offline, Screen, SignInCard } from "../../components/ui";

export default function Inbox() {
  const { me } = useAuth();
  const router = useRouter();
  if (!me) {
    return (
      <Screen>
        <SignInCard title="Notes for you" body="Sign in to get a note here when results come out, when you are shortlisted, and when an organisation you follow opens a challenge." onSignIn={() => toSignIn(router, "/inbox")} />
      </Screen>
    );
  }
  return <InboxList userId={me.id} />;
}

/** Opening an item marks only that item read. Older items load 50 at a time. */
function InboxList({ userId }: { userId: string }) {
  const router = useRouter();
  const t = useTheme();
  const first = useLoad(() => api("/inbox", { schema: inbox }), [userId], { cache: `inbox.${userId}` });
  const [older, setOlder] = useState<{ items: InboxItem[]; next: string | null } | null>(null);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [allRead, setAllRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const items = [...(first.data?.items ?? []), ...(older?.items ?? [])];
  const next = older ? older.next : first.data?.next ?? null;
  const isRead = (n: InboxItem) => allRead || !!n.read_at || read.has(n.id);
  const unread = items.filter((n) => !isRead(n)).length;

  function open(n: InboxItem, to: string | null) {
    if (!isRead(n)) {
      setRead((s) => new Set(s).add(n.id));
      void api(`/inbox/${n.id}/read`, { method: "POST" }).catch(() => {});
    }
    if (to) router.push(to as never);
  }
  async function markAll() {
    setMsg("");
    try { await api("/inbox/read", { method: "POST" }); setAllRead(true); } catch (e) { setMsg((e as Error).message); }
  }
  async function more() {
    if (!next) return;
    setBusy(true); setMsg("");
    try {
      const r = await api(`/inbox?before=${encodeURIComponent(next)}`, { schema: inbox });
      setOlder({ items: [...(older?.items ?? []), ...r.items], next: r.next ?? null });
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  const refresh = async () => { setOlder(null); setRead(new Set()); setAllRead(false); await first.refresh(); };

  return (
    <Screen onRefresh={refresh} refreshing={first.refreshing}>
      {first.err && !first.data ? <Notice kind="err">{first.err}</Notice> : null}
      {first.stale ? <Offline /> : null}
      {!first.data && !first.err ? <Loading /> : null}
      {first.data && items.length === 0 ? <Body muted>Nothing yet. You get a note here when results come out, and when an organisation you follow opens a new challenge.</Body> : null}
      {unread > 0 ? <View style={{ alignSelf: "flex-end" }}><Text accessibilityRole="button" onPress={() => void markAll()} style={{ color: t.ink, fontSize: 14, fontWeight: "700", textDecorationLine: "underline", padding: 6 }}>Mark all as read</Text></View> : null}
      {items.map((n) => {
        const r = appRoute(n.link);
        const to = r === "/inbox" ? null : r;
        const unseen = !isRead(n);
        return (
          <Card key={n.id} onPress={() => open(n, to)} style={unseen ? { borderLeftWidth: 4, borderLeftColor: "#c8321f" } : undefined}>
            <Text accessibilityLabel={unseen ? `Unread: ${n.title}` : n.title} style={{ color: t.ink, fontSize: 16, fontWeight: unseen ? "800" : "600" }}>{n.title}</Text>
            {n.body ? <Body muted>{n.body}</Body> : null}
            <Text style={{ color: t.muted, fontSize: 12 }}>{fmtDate(n.created_at)}</Text>
          </Card>
        );
      })}
      {msg ? <Notice kind="err">{msg}</Notice> : null}
      {next ? <Button title="Show older" kind="ghost" busy={busy} onPress={() => void more()} /> : null}
    </Screen>
  );
}
