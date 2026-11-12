import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../lib/api";
import { API_URL } from "../../../lib/config";
import { challengeDetail, follows as followsSchema, teamResponse, type ChallengeDetail, type Question, type Team } from "../../../lib/schemas";
import { daysLeft, fmtDate, teamSize } from "../../../lib/format";
import { useLoad } from "../../../lib/useLoad";
import { useTheme } from "../../../lib/theme";
import { Banner, Scrim } from "../../../components/Banner";
import { F } from "../../../lib/fonts";
import { shadow } from "../../../lib/theme";
import { Body, Button, Card, DaysStamp, Field, H2, Label, Loading, Notice, Pill, Screen, StatusStamp } from "../../../components/ui";

export default function ChallengeScreen() {
  const { org, slug } = useLocalSearchParams<{ org: string; slug: string }>();
  const t = useTheme();
  const base = `/orgs/${org}/challenges/${slug}`;
  const ch = useLoad(async () => (await api(base, { schema: challengeDetail })).challenge, [base]);
  const tm = useLoad(async () => (await api(`${base}/team`, { schema: teamResponse })).team, [base]);
  const fol = useLoad(() => api("/follows", { schema: followsSchema }), []);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const c = ch.data;
  const following = !!fol.data?.orgs.some((o) => o.slug === org);
  async function toggleFollow() {
    try { await api(`/follows/orgs/${org}`, { method: following ? "DELETE" : "PUT" }); await fol.reload(); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  const refresh = async () => { await Promise.all([ch.refresh(), tm.refresh()]); };

  if (!c) return <Screen>{ch.err ? <Notice kind="err">{ch.err === "Not found" ? "We could not find that challenge." : ch.err}</Notice> : <Loading />}</Screen>;
  const d = daysLeft(c.applications_close_at);
  const teamLoaded = tm.loaded;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen onRefresh={refresh} refreshing={ch.refreshing} flush>
        <Stack.Screen options={{ headerShown: false }} />
        <Banner url={c.cover_url} seed={c.slug} label={c.title} style={{ height: 300 }}>
          <Scrim height={90} />
        </Banner>
        <View style={{ marginTop: -26, backgroundColor: t.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Pill text={c.status === "open" ? "Open" : c.status} />
              <Text numberOfLines={1} style={{ flex: 1, color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" }}>{c.org.name}</Text>
            </View>
            <Pressable onPress={toggleFollow} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: t.ink, justifyContent: "center" }}>
              <Text style={{ color: t.ink, fontSize: 13, fontWeight: "700" }}>{following ? "Following" : "Follow"}</Text>
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6 }}>{c.title}</Text>
          {c.summary ? <Body muted>{c.summary}</Body> : null}
          {c.topics.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{c.topics.map((x) => <Pill key={x} text={x} />)}</View> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={[{ flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, padding: 12 }, shadow(0.06)]}><Label>Closes</Label><Text style={{ color: t.ink, fontFamily: F.display, fontSize: 19 }}>{fmtDate(c.applications_close_at)}</Text></View>
            <View style={[{ flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, padding: 12 }, shadow(0.06)]}><Label>Team</Label><Text style={{ color: t.ink, fontFamily: F.display, fontSize: 19 }}>{teamSize(c.team_min, c.team_max)}</Text></View>
            <View style={{ flex: 1, backgroundColor: "#111111", borderRadius: 14, padding: 12 }}><Label>Pitch</Label><Text style={{ color: "#F6F4EE", fontFamily: F.display, fontSize: 19 }}>{fmtDate(c.pitch_due_at)}</Text></View>
          </View>
          {d !== null && d > 0 ? <View style={{ flexDirection: "row" }}><DaysStamp days={d} tilt={-2} /></View> : null}

      {c.description ? <><H2>About</H2><Body>{c.description}</Body></> : null}
      {c.prizes ? <><H2>Prizes</H2><Body>{c.prizes}</Body></> : null}

      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <TeamPanel base={base} c={c} team={tm.data} loaded={teamLoaded} onChange={refresh} />
      {c.results_published ? <Button title="See results on the web" kind="ghost" onPress={() => void Linking.openURL(`${API_URL}/o/${org}/c/${slug}#results`)} /> : null}
        </View>
      </Screen>
      <BackButton />
    </View>
  );
}

function TeamPanel({ base, c, team, loaded, onChange }: { base: string; c: ChallengeDetail; team: Team | null; loaded: boolean; onChange: () => Promise<void> }) {
  const t = useTheme();
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [answers, setAnswers] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null); setBusy(true);
    try { await fn(); await onChange(); setMsg({ kind: "ok", text: ok }); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); } finally { setBusy(false); }
  };
  const open = c.status === "open" && (!c.applications_close_at || Date.now() < c.applications_close_at) && (!c.applications_open_at || Date.now() >= c.applications_open_at);

  if (!loaded) return <Loading />;

  if (!team) {
    if (!open) return <Card><Body muted>This challenge is not taking applications.</Body></Card>;
    return (
      <>
        <H2>Create or join a team</H2>
        <Body muted>Teams of {teamSize(c.team_min, c.team_max)}. Create a team and share the invite code, or join one with a code.</Body>
        <Field label="Team name" value={name} onChangeText={setName} />
        <Button title="Create team" busy={busy} disabled={name.trim().length < 2} onPress={() => void run(() => api(`${base}/team`, { method: "POST", json: { name } }), "Team created")} />
        <Field label="Or join with an invite code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
        <Button title="Join team" kind="ghost" busy={busy} disabled={code.trim().length < 6} onPress={() => void run(() => api("/teams/join", { method: "POST", json: { code } }), "You joined the team")} />
        {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      </>
    );
  }

  const size = team.members.length;
  const sizeOk = size >= c.team_min && size <= c.team_max;
  const canApply = team.is_lead && (team.status === "forming" || team.status === "applied") && open;
  const form = answers ?? team.application?.answers ?? {};
  return (
    <>
      <H2>Your team</H2>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800" }}>{team.name}</Text>
            {team.members.map((m) => <Body key={m.id} muted>{m.name}{m.is_lead ? " (lead)" : ""}</Body>)}
          </View>
          <StatusStamp status={team.status} />
        </View>
        {team.status === "forming" || team.status === "applied" ? (
          <>
            <Label>Invite code</Label>
            <Text selectable style={{ color: t.ink, fontSize: 24, fontWeight: "900", letterSpacing: 3 }}>{team.invite_code}</Text>
            <Body muted style={{ fontSize: 13 }}>Share this code. Teammates open this challenge in the app and join with it.</Body>
          </>
        ) : null}
      </Card>

      {canApply ? (
        <>
          <H2>{team.status === "applied" ? "Your application" : "Apply"}</H2>
          {!sizeOk ? <Notice kind="err">This challenge needs teams of {teamSize(c.team_min, c.team_max)}. You have {size}.</Notice> : null}
          {c.questions.map((q) => <QuestionField key={q.id} q={q} value={form[q.id] ?? ""} onChange={(v) => setAnswers({ ...form, [q.id]: v })} />)}
          <Button title={team.status === "applied" ? "Update application" : "Send application"} busy={busy} disabled={!sizeOk}
            onPress={() => void run(() => api(`/teams/${team.id}/application`, { method: "PUT", json: { answers: form } }), team.status === "applied" ? "Application updated" : "Application sent")} />
        </>
      ) : null}
      {!team.is_lead && team.status === "forming" ? <Body muted>Your team lead sends the application.</Body> : null}
      {team.status === "applied" && !canApply ? <Body muted>Received. The organisers will review your application.</Body> : null}
      {c.status !== "completed" && (team.status === "shortlisted" || team.status === "finalist") ? <Body muted>Pitches are added on the web for now. Open Kakushin in your browser to add your deck and links.</Body> : null}
      {c.status === "completed" && ["shortlisted", "finalist", "winner"].includes(team.status) ? <Button title="Get your certificate" onPress={() => router.push("/profile")} /> : null}
      {team.status === "forming" || team.status === "applied" ? (
        <Button title="Leave team" kind="ghost" busy={busy} onPress={() => void run(() => api(`/teams/${team.id}/leave`, { method: "POST" }), "You left the team")} />
      ) : null}
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
    </>
  );
}

function QuestionField({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  const label = q.label + (q.required ? " *" : "");
  if (q.type === "choice") {
    return (
      <View style={{ gap: 6 }}>
        <Label>{label}</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{q.options.map((o) => <Pill key={o} text={o} on={value === o} onPress={() => onChange(value === o ? "" : o)} />)}</View>
      </View>
    );
  }
  return <Field label={label} value={value} onChangeText={onChange} multiline={q.type === "long_text"} autoCapitalize={q.type === "url" ? "none" : "sentences"} keyboardType={q.type === "url" ? "url" : "default"} />;
}

/** Round back button floating over the banner. */
function BackButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"
      style={[{ position: "absolute", top: insets.top + 8, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: "#F6F4EEEB", alignItems: "center", justifyContent: "center" }, shadow(0.3)]}>
      <Svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="#111111" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><Path d="M11 3L5 9l6 6" /></Svg>
    </Pressable>
  );
}
