import React, { useState } from "react";
import { Switch, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { myEvents, topics as topicsSchema } from "../lib/schemas";
import { topicLabel } from "../lib/fonts";
import { useLoad } from "../lib/useLoad";
import { useTheme } from "../lib/theme";
import { Body, Button, Card, Field, H2, Label, Notice, Pill, Screen } from "../components/ui";

const STATE: Record<string, string> = { pending: "In review", published: "Listed", rejected: "Not listed", removed: "Taken off" };

/** A date typed as 2027-03-05 becomes the end of that day; anything else is not a date. */
export function parseDay(raw: string): number | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0);
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d.getTime() : undefined;
}

/** Send in a hackathon or opportunity from outside Kakushin. The team checks it before it is listed. */
export default function SuggestEvent() {
  const { me } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const topics = useLoad(() => api("/challenges/topics", { schema: topicsSchema }), [], { cache: "topics" });
  const mine = useLoad(() => api("/events/mine", { schema: myEvents }), [me?.id]);
  const blank = { title: "", url: "", summary: "", organizer: "", location: "", deadline: "", starts: "" };
  const [f, setF] = useState(blank);
  const [online, setOnline] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  if (!me) return <Redirect href={{ pathname: "/sign-in", params: { next: "/suggest-event" } } as never} />;
  const set = (k: keyof typeof blank) => (v: string) => setF({ ...f, [k]: v });
  async function send() {
    const deadline_at = parseDay(f.deadline), starts_at = parseDay(f.starts);
    if (deadline_at === undefined || starts_at === undefined) { setMsg({ kind: "err", text: "Write dates like 2027-03-05, or leave them empty." }); return; }
    const url = /^https?:\/\//i.test(f.url.trim()) ? f.url.trim() : `https://${f.url.trim()}`;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ pending: boolean }>("/events/suggest", { method: "POST", json: { title: f.title, url, summary: f.summary, organizer: f.organizer, location: f.location, is_online: online, deadline_at, starts_at, topics: picked } });
      setMsg({ kind: "ok", text: r.pending ? "Thanks. It is waiting for review, and you get a note when it is listed." : "Listed. It is in Global events now." });
      setF(blank); setPicked([]); setOnline(false);
      await mine.reload();
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <Screen>
      <Body muted>Know a hackathon or opportunity that others here should see? The Kakushin team checks every suggestion before it is listed.</Body>
      <Field label="Name of the event" value={f.title} onChangeText={set("title")} maxLength={160} />
      <Field label="Link to its official page" value={f.url} onChangeText={set("url")} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" maxLength={500} />
      <Field label="One line about it (optional)" value={f.summary} onChangeText={set("summary")} maxLength={200} />
      <Field label="Who runs it (optional)" value={f.organizer} onChangeText={set("organizer")} maxLength={80} />
      <Field label="Where (optional)" value={f.location} onChangeText={set("location")} placeholder="City and country" maxLength={120} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700" }}>It is online</Text>
        <Switch value={online} onValueChange={setOnline} accessibilityLabel="It is online" />
      </View>
      <Field label="Apply by (optional)" value={f.deadline} onChangeText={set("deadline")} placeholder="2027-03-05" keyboardType="numbers-and-punctuation" maxLength={10} />
      <Field label="Starts (optional)" value={f.starts} onChangeText={set("starts")} placeholder="2027-03-20" keyboardType="numbers-and-punctuation" maxLength={10} />
      <Label>Topics (up to 5)</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {topics.data?.topics.map((x) => <Pill key={x} text={topicLabel(x)} on={picked.includes(x)} onPress={() => setPicked(picked.includes(x) ? picked.filter((y) => y !== x) : picked.length < 5 ? [...picked, x] : picked)} />)}
      </View>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <Button title="Send for review" disabled={f.title.trim().length < 3 || !f.url.trim()} busy={busy} onPress={() => void send()} />
      {mine.data?.events.length ? (
        <>
          <H2>Your suggestions</H2>
          {mine.data.events.map((e) => (
            <Card key={e.slug} onPress={() => router.push(`/event/${e.slug}`)}>
              <Label>{STATE[e.state] ?? e.state}</Label>
              <Text style={{ color: t.ink, fontSize: 17, fontWeight: "700" }}>{e.title}</Text>
              {e.review_note ? <Body muted>{e.review_note}</Body> : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
