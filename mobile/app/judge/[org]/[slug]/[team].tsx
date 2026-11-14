import React, { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth";
import { judgeTeam, repoStats, type Criterion } from "../../../../lib/schemas";
import { NETWORK_ERROR, enqueue, flush, queued } from "../../../../lib/judgeQueue";
import { useLoad } from "../../../../lib/useLoad";
import { useTheme } from "../../../../lib/theme";
import { Body, Button, Card, Field, H2, Label, Loading, Notice, Offline, Screen } from "../../../../components/ui";
import { ImageStrip, Video } from "../../../../components/media";

type Vals = Record<string, { score: number | null; comment: string }>;
type Msg = { kind: "ok" | "err"; text: string } | null;

/** One team: the pitch, the deck, who pushed code, and scoring per criterion. Works offline once opened. */
export default function JudgeTeamScreen() {
  const { org, slug, team, name } = useLocalSearchParams<{ org: string; slug: string; team: string; name?: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const base = `/judge/${org}/${slug}/teams/${team}`;
  const d = useLoad(() => api(base, { schema: judgeTeam }), [base], { cache: me ? `judge.${me.id}.${team}` : null });
  const [vals, setVals] = useState<Vals | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  // Start from what was sent before, or from a sheet still waiting on this phone.
  useEffect(() => {
    if (!d.data || vals || !me) return;
    void (async () => {
      const v: Vals = {};
      for (const c of d.data!.criteria) v[c.id] = { score: null, comment: "" };
      for (const s of d.data!.scores) v[s.criterion_id] = { score: s.score, comment: s.comment ?? "" };
      const waiting = (await queued(me.id)).find((q) => q.path === `${base}/scores`);
      if (waiting) { for (const s of waiting.scores) v[s.criterion_id] = { score: s.score, comment: s.comment }; setMsg({ kind: "err", text: "These scores are saved on this phone and will send when you are back online." }); }
      setVals(v);
    })();
  }, [d.data, me?.id]);

  if (!d.data || !vals) return <Screen>{d.err && !d.data ? <Notice kind="err">{d.err}</Notice> : <Loading />}</Screen>;
  const x = d.data, crit = x.criteria;
  const locked = !x.scoring_open || x.own_team;
  const complete = crit.every((c) => vals[c.id]?.score !== null && vals[c.id]?.score !== undefined);
  const total = complete ? Math.round(crit.reduce((a, c) => a + (vals[c.id]!.score! / c.max_score) * c.weight * 100, 0) * 10) / 10 : null;

  async function save() {
    if (!me) return;
    const scores = crit.filter((c) => vals![c.id]?.score !== null).map((c) => ({ criterion_id: c.id, score: vals![c.id]!.score!, comment: vals![c.id]!.comment.trim() }));
    if (!scores.length) { setMsg({ kind: "err", text: "Give at least one score" }); return; }
    setBusy(true); setMsg(null);
    try {
      await flush(me.id); // anything older goes first
      await api(`${base}/scores`, { method: "PUT", json: { scores } });
      setMsg({ kind: "ok", text: complete ? "Scores sent. This team is fully scored." : "Scores sent. Score the rest to finish this team." });
    } catch (e) {
      const m = (e as Error).message;
      if (m.startsWith(NETWORK_ERROR)) {
        await enqueue(me.id, { path: `${base}/scores`, team, teamName: x.team.name, scores, saved_at: Date.now() });
        setMsg({ kind: "err", text: "No connection. Your scores are saved on this phone and will send when you are back online." });
      } else setMsg({ kind: "err", text: m });
    } finally { setBusy(false); }
  }
  function conflict() {
    Alert.alert(`Step back from ${x.team.name}?`, "Use this if you know someone on the team. Any scores you gave it are removed and the organiser is told, so they can give the team another judge.", [
      { text: "Cancel", style: "cancel" },
      { text: "I know this team", style: "destructive", onPress: () => void api(`${base}/conflict`, { method: "POST" }).then(() => router.back()).catch((e: Error) => setMsg({ kind: "err", text: e.message })) },
    ]);
  }
  const p = x.pitch;
  const open = (u: string) => void Linking.openURL(u);
  return (
    <Screen onRefresh={d.refresh} refreshing={d.refreshing}>
      <Stack.Screen options={{ title: name ?? x.team.name }} />
      {d.stale ? <Offline /> : null}
      <Body muted>{x.blind ? "Blind review: member names are hidden." : x.team.members.map((m) => (m.institution ? `${m.name} (${m.institution})` : m.name)).join(", ")}</Body>
      <H2>Pitch</H2>
      {/* Video and screenshots first, when the team added them. Either can be missing. */}
      {p?.video_embed ? <Video embed={p.video_embed} title={x.team.name} /> : null}
      <ImageStrip images={x.images} title={x.team.name} />
      {!p && !x.images.length ? <Body muted>This team has not added a pitch yet.</Body> : !p ? null : (
        <Card>
          {p.has_deck ? <Button title="Open the deck" onPress={() => router.push({ pathname: "/deck/[team]", params: { team, name: x.team.name } } as never)} /> : <Body muted>No deck.</Body>}
          {[["Video", p.video_url], ["Demo", p.demo_url], ["Code", p.repo_url]].filter(([, u]) => u).map(([l, u]) => (
            <Pressable key={l} onPress={() => open(u!)} accessibilityRole="link"><Label>{l}</Label><Text style={{ color: t.redText, fontSize: 15, textDecorationLine: "underline" }} numberOfLines={1}>{u}</Text></Pressable>
          ))}
          {p.notes ? <><Label>Notes</Label><Body>{p.notes}</Body></> : null}
        </Card>
      )}
      {p?.repo_url ? <Repo path={`${base}/repo`} /> : null}

      <H2>Score</H2>
      {!x.scoring_open ? <Notice kind="err">Scoring is not open yet. The organiser starts judging.</Notice> : null}
      {crit.map((c) => <Score key={c.id} c={c} v={vals[c.id]!} locked={locked} onChange={(v) => setVals({ ...vals, [c.id]: v })} />)}
      <Text style={{ color: t.ink, fontSize: 20, fontWeight: "900" }}>Weighted total: {total === null ? "score every criterion" : `${total} / 100`}</Text>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      {!locked ? <Button title="Save scores" busy={busy} onPress={() => void save()} /> : null}
      {!x.own_team ? <Button title="I know this team" kind="ghost" onPress={conflict} /> : null}
      {Platform.OS === "web" ? null : <View style={{ height: 8 }} />}
    </Screen>
  );
}

/** A stepper for one criterion, with a comment. */
function Score({ c, v, locked, onChange }: { c: Criterion; v: { score: number | null; comment: string }; locked: boolean; onChange: (v: { score: number | null; comment: string }) => void }) {
  const t = useTheme();
  const step = (n: number) => onChange({ ...v, score: Math.min(c.max_score, Math.max(0, (v.score ?? (n > 0 ? -1 : 1)) + n)) });
  const btn = (label: string, n: number) => (
    <Pressable disabled={locked} onPress={() => step(n)} accessibilityRole="button" accessibilityLabel={`${n > 0 ? "Raise" : "Lower"} ${c.name}`}
      style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: t.ink, alignItems: "center", justifyContent: "center", opacity: locked ? 0.4 : 1 }}>
      <Text style={{ color: t.ink, fontSize: 26, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
  return (
    <Card>
      <Text style={{ color: t.ink, fontSize: 17, fontWeight: "800" }}>{c.name}</Text>
      <Body muted style={{ fontSize: 13 }}>Out of {c.max_score} · weight {Math.round(c.weight * 100)}%{c.description ? ` · ${c.description}` : ""}</Body>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginVertical: 6 }}>
        {btn("−", -1)}
        <Text accessibilityLabel={`${c.name}: ${v.score ?? "not scored"}`} style={{ color: t.ink, fontSize: 40, fontWeight: "900", minWidth: 70, textAlign: "center" }}>{v.score ?? "–"}</Text>
        {btn("+", 1)}
      </View>
      <Field label="Comment (optional)" value={v.comment} editable={!locked} multiline maxLength={1000} onChangeText={(s) => onChange({ ...v, comment: s })} />
    </Card>
  );
}

/** Who pushed code to the team's GitHub repo. */
function Repo({ path }: { path: string }) {
  const r = useLoad(() => api(path, { schema: repoStats }), [path]);
  if (!r.data) return r.err ? <Body muted>Could not check the repo: {r.err}</Body> : <Body muted>Checking the repo on GitHub...</Body>;
  const x = r.data;
  if (x.status !== "ok") return <Body muted>{x.status === "not_found" ? "GitHub cannot see this repo. It may be private." : x.status === "rate_limited" ? "GitHub is busy. Try again in a few minutes." : "GitHub could not be reached."}</Body>;
  const list = x.contributors ?? [];
  const missing = x.no_commits;
  return (
    <Card>
      <Label>Who pushed code</Label>
      {list.length === 0 ? <Body muted>No commits yet.</Body> : <Body>{list.map((c) => `${x.blind ? (c.on_team ? "Team member" : "Not on the team") : c.member ?? `${c.login} (not on the team)`} ${c.commits}`).join(", ")}</Body>}
      {typeof missing === "number" ? (missing ? <Body muted>{missing} {missing === 1 ? "member has" : "members have"} no commits matched.</Body> : null)
        : missing?.length ? <Body muted>No commits matched for {missing.map((m) => (m.linked ? m.name : `${m.name} (no GitHub link on their profile)`)).join(", ")}.</Body> : null}
    </Card>
  );
}
