import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../lib/api";
import { shareInvite } from "../../../lib/share";
import { useAuth } from "../../../lib/auth";
import { challengeDetail, teamResponse, type ChallengeDetail, type Question, type Team } from "../../../lib/schemas";
import { fmtDate, teamSize } from "../../../lib/format";
import { F } from "../../../lib/fonts";
import { useLoad } from "../../../lib/useLoad";
import { shadow, useTheme } from "../../../lib/theme";
import { Body, Button, Card, Field, Hand, Label, Loading, Notice, Pill, Screen } from "../../../components/ui";

type Msg = { kind: "ok" | "err"; text: string } | null;
const STEPS = ["Team", "Answers", "Check and send"] as const;

/** An answer is fine when it is filled in (if required) and, for links, starts with http. */
function problem(q: Question, v: string): string | null {
  if (q.required && !v.trim()) return "Please answer this one.";
  if (q.type === "url" && v.trim() && !/^https?:\/\/\S+$/i.test(v.trim())) return "Start the link with https://";
  return null;
}

export default function Apply() {
  const { org, slug } = useLocalSearchParams<{ org: string; slug: string }>();
  const router = useRouter();
  const t = useTheme();
  const { me } = useAuth();
  const base = `/orgs/${org}/challenges/${slug}`;
  const ch = useLoad(async () => (await api(base, { schema: challengeDetail })).challenge, [base]);
  const tm = useLoad(async () => (await api(`${base}/team`, { schema: teamResponse })).team, [base]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string> | null>(null);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [showErr, setShowErr] = useState(false);

  const c = ch.data;
  const team = tm.data;
  // Applying needs an account; the sign-in screen brings the person straight back here.
  if (!me) return <Redirect href={{ pathname: "/sign-in", params: { next: `/apply/${org}/${slug}` } } as never} />;
  if (!c || !tm.loaded) return <Screen><Stack.Screen options={{ headerShown: false }} />{ch.err ? <Notice kind="err">{ch.err}</Notice> : <Loading />}</Screen>;

  const open = c.status === "open" && (!c.applications_close_at || Date.now() < c.applications_close_at) && (!c.applications_open_at || Date.now() >= c.applications_open_at);
  const form = answers ?? team?.application?.answers ?? {};
  const size = team?.members.length ?? 0;
  const sizeOk = !!team && size >= c.team_min && size <= c.team_max;
  const errors = c.questions.map((q) => problem(q, form[q.id] ?? ""));
  const answersOk = errors.every((e) => !e);
  const already = team?.status === "applied";

  const exit = () => (router.canGoBack() ? router.back() : router.replace("/"));

  async function send() {
    if (!team) return;
    setMsg(null); setBusy(true);
    try { await api(`/teams/${team.id}/application`, { method: "PUT", json: { answers: form } }); await tm.reload(); setDone(true); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  if (!open && !done) {
    return <Shell title="Applications are closed" onExit={exit}><Body muted>This challenge is not taking applications right now.</Body><Button title="Back to the challenge" onPress={exit} /></Shell>;
  }
  if (done && team) return <Received c={c} team={team} onTeam={() => router.replace("/teams")} onMore={() => router.replace("/")} />;
  if (team && !team.is_lead && team.status === "forming") {
    return <Shell title="Your lead sends it" onExit={exit}><Body muted>Your team lead sends the application. You will get a note when it is in.</Body><Button title="Back to the challenge" onPress={exit} /></Shell>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => (step > 0 ? setStep(step - 1) : exit())} accessibilityRole="button" accessibilityLabel={step > 0 ? "Previous step" : "Close"} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.sand, alignItems: "center", justifyContent: "center" }}>
            <Svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke={t.ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">{step > 0 ? <Path d="M11 3L5 9l6 6" /> : <Path d="M4 4l10 10M14 4L4 14" />}</Svg>
          </Pressable>
          <Text style={{ color: t.ink, fontSize: 14, fontWeight: "700" }}>Step {step + 1} of 3</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 3, now: step + 1 }}>
          {STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 6, backgroundColor: i < step ? t.ink : i === step ? "#c8321f" : t.line }} />)}
        </View>
      </SafeAreaView>
      <Screen scroll>
        {step === 0 ? <TeamStep base={base} c={c} team={team ?? null} sizeOk={sizeOk} onChange={tm.reload} onNext={() => setStep(1)} /> : null}
        {step === 1 ? (
          <>
            <Hand>Tell us about it</Hand>
            <Title>Your answers.</Title>
            {c.questions.length === 0 ? <Body muted>This challenge has no questions. Go on to check and send.</Body> : null}
            {c.questions.map((q, i) => <QuestionField key={q.id} q={q} value={form[q.id] ?? ""} error={showErr || (form[q.id] ?? "") !== "" ? errors[i] ?? null : null} onChange={(v) => setAnswers({ ...form, [q.id]: v })} />)}
            <Button title="Continue" onPress={() => { if (answersOk) setStep(2); else setShowErr(true); }} />
          </>
        ) : null}
        {step === 2 ? (
          <>
            <Hand>Nearly there</Hand>
            <Title>Check and send.</Title>
            <Body muted>{already ? "This replaces your earlier application." : `You can still edit until applications close${c.applications_close_at ? ` on ${fmtDate(c.applications_close_at)}` : ""}.`}</Body>
            <Card>
              <Row label="Team" onEdit={() => setStep(0)} />
              <Text style={{ color: t.ink, fontFamily: F.display, fontSize: 22 }}>{team?.name}</Text>
              <Body muted>{team?.members.map((m) => m.name).join(", ")}</Body>
              {!sizeOk ? <Notice kind="err">This challenge needs teams of {teamSize(c.team_min, c.team_max)}. You have {size}.</Notice> : null}
            </Card>
            <Card>
              <Row label="Answers" onEdit={() => setStep(1)} />
              {c.questions.map((q, i) => (
                <View key={q.id} style={{ gap: 2, paddingTop: i ? 10 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                  <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>{q.label}</Text>
                  <Text style={{ color: t.ink, fontSize: 15, lineHeight: 21 }}>{form[q.id]?.trim() || "Not answered"}</Text>
                </View>
              ))}
            </Card>
            {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
            <Button title={already ? "Update application" : "Send application"} busy={busy} disabled={!sizeOk || !answersOk} onPress={() => void send()} />
            <Body muted style={{ fontSize: 13, textAlign: "center" }}>Your whole team gets a note when it is sent.</Body>
          </>
        ) : null}
      </Screen>
    </View>
  );
}

const Title = ({ children }: { children: React.ReactNode }) => { const t = useTheme(); return <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 34, lineHeight: 36, letterSpacing: -0.6 }}>{children}</Text>; };

function Row({ label, onEdit }: { label: string; onEdit: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Label>{label}</Label>
      <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${label.toLowerCase()}`} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: t.ink, fontSize: 14, fontWeight: "700" }}>Edit</Text></Pressable>
    </View>
  );
}

function Shell({ title, onExit, children }: { title: string; onExit: () => void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.sand, alignItems: "center", justifyContent: "center" }}>
          <Svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke={t.ink} strokeWidth={2.6} strokeLinecap="round"><Path d="M4 4l10 10M14 4L4 14" /></Svg>
        </Pressable>
      </SafeAreaView>
      <Screen><Title>{title}</Title>{children}</Screen>
    </View>
  );
}

/** Step 1: make a team or join one, share the invite code, check the size. */
function TeamStep({ base, c, team, sizeOk, onChange, onNext }: { base: string; c: ChallengeDetail; team: Team | null; sizeOk: boolean; onChange: () => Promise<void>; onNext: () => void }) {
  const t = useTheme();
  const [mode, setMode] = useState<"start" | "join">("start");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setMsg(null); setBusy(true); try { await fn(); await onChange(); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); } finally { setBusy(false); } };
  const sizeText = teamSize(c.team_min, c.team_max);

  if (!team) {
    return (
      <>
        <Hand>Step one</Hand>
        <Title>Your team.</Title>
        <Body muted>This challenge takes teams of {sizeText}. Start one, or join friends who already have.</Body>
        <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: t.sand, borderRadius: 12, padding: 4 }}>
          {(["start", "join"] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} style={{ flex: 1, minHeight: 44, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: mode === m ? t.ink : "transparent" }}>
              <Text style={{ color: mode === m ? t.bg : t.ink, fontSize: 15, fontWeight: "700" }}>{m === "start" ? "Start a team" : "Join with a code"}</Text>
            </Pressable>
          ))}
        </View>
        {mode === "start" ? (
          <>
            <Field label="Team name" value={name} onChangeText={setName} />
            <Body muted style={{ fontSize: 13 }}>Organisers and judges see this name.</Body>
            {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
            <Button title="Create team" busy={busy} disabled={name.trim().length < 2} onPress={() => void run(() => api(`${base}/team`, { method: "POST", json: { name } }))} />
          </>
        ) : (
          <>
            <Field label="Invite code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
            {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
            <Button title="Join team" busy={busy} disabled={code.trim().length < 6} onPress={() => void run(() => api("/teams/join", { method: "POST", json: { code } }))} />
          </>
        )}
      </>
    );
  }

  const share = () => void shareInvite(team, c.title);
  return (
    <>
      <Hand>Step one</Hand>
      <Title>Your team.</Title>
      <Card>
        <Text style={{ color: t.ink, fontFamily: F.display, fontSize: 24 }}>{team.name}</Text>
        <View style={{ gap: 6, marginTop: 4 }}>
          {team.members.map((m) => (
            <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.ink, alignItems: "center", justifyContent: "center" }}><Text style={{ color: t.bg, fontSize: 12, fontWeight: "700" }}>{m.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</Text></View>
              <Text style={{ flex: 1, color: t.ink, fontSize: 16, fontWeight: "600" }}>{m.name}</Text>
              {m.is_lead ? <Pill text="Lead" /> : null}
            </View>
          ))}
        </View>
      </Card>
      <Card>
        <Label>Invite code</Label>
        <Text selectable style={{ color: t.ink, fontFamily: F.display, fontSize: 30, letterSpacing: 4 }}>{team.invite_code}</Text>
        <Body muted style={{ fontSize: 13 }}>Send the link: it opens the app, or the web page if they do not have it yet.</Body>
        <Button title="Share invite" kind="ghost" onPress={share} />
      </Card>
      {sizeOk ? <Body muted>Team size is good ({team.members.length} of {sizeText}). You can also keep going and invite people before you send.</Body> : <Notice kind="err">This challenge needs teams of {sizeText}. You have {team.members.length} so far. You can answer now and invite people before you send.</Notice>}
      <Button title="Continue" onPress={onNext} />
      <Button title="Leave team" kind="ghost" busy={busy} onPress={() => void run(() => api(`/teams/${team.id}/leave`, { method: "POST" }))} />
    </>
  );
}

function QuestionField({ q, value, error, onChange }: { q: Question; value: string; error: string | null; onChange: (v: string) => void }) {
  const t = useTheme();
  const label = q.label + (q.required ? " *" : "");
  const err = error ? <Text accessibilityRole="alert" style={{ color: t.redText, fontSize: 13, fontWeight: "600" }}>{error}</Text> : null;
  if (q.type === "choice") {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ color: t.ink, fontSize: 15, fontWeight: "700" }}>{label}</Text>
        <View style={{ gap: 8 }}>
          {q.options.map((o) => (
            <Pressable key={o} onPress={() => onChange(value === o ? "" : o)} accessibilityRole="radio" accessibilityState={{ selected: value === o }}
              style={{ minHeight: 52, borderRadius: 14, paddingHorizontal: 16, justifyContent: "center", borderWidth: value === o ? 2 : 1.5, borderColor: value === o ? t.ink : t.line, backgroundColor: t.card }}>
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: value === o ? "700" : "400" }}>{o}</Text>
            </Pressable>
          ))}
        </View>
        {err}
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Field label={label} value={value} onChangeText={onChange} multiline={q.type === "long_text"} autoCapitalize={q.type === "url" ? "none" : "sentences"} autoCorrect={q.type !== "url"} keyboardType={q.type === "url" ? "url" : "default"} />
      {err}
    </View>
  );
}

/** The end of the flow: a perforated red stamp, what happens next, and ways to keep going. */
function Received({ c, team, onTeam, onMore }: { c: ChallengeDetail; team: Team; onTeam: () => void; onMore: () => void }) {
  const t = useTheme();
  const W = 252, H = 154, holes = [] as { x: number; y: number }[];
  for (let x = 7; x < W; x += 14) { holes.push({ x, y: 0 }, { x, y: H }); }
  for (let y = 7; y < H; y += 14) { holes.push({ x: 0, y }, { x: W, y }); }
  const today = fmtDate(Date.now()).toUpperCase();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen>
        <SafeAreaView edges={["top"]} />
        <View style={{ alignItems: "center", gap: 16, paddingTop: 36 }}>
          <View accessible accessibilityLabel="Stamp: application received" style={[{ width: W, height: H, transform: [{ rotate: "-4deg" }] }, shadow(0.25)]}>
            <Svg width={W} height={H}>
              <Rect width={W} height={H} fill="#c8321f" />
              {holes.map((h, i) => <Circle key={i} cx={h.x} cy={h.y} r={4.5} fill={t.bg} />)}
            </Svg>
            <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 4 }}>
              <Text numberOfLines={1} style={{ color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 3 }}>{c.title.toUpperCase().slice(0, 24)}</Text>
              <Text style={{ color: "#fff", fontFamily: F.display, fontSize: 40, lineHeight: 42 }}>RECEIVED</Text>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 3 }}>{today}</Text>
            </View>
          </View>
          <View style={{ marginTop: 8 }}><Hand size={30}>{`Nice work, ${team.name}!`}</Hand></View>
          <Body muted style={{ textAlign: "center" }}>Your application is with {c.org.name}. We will ping you the moment there is news.</Body>
        </View>
        <View style={{ marginTop: 12 }}>
          <Label>What happens next</Label>
          <Step when="Today" what="Application sent" done />
          {c.applications_close_at ? <Step when={fmtDate(c.applications_close_at)} what="Applications close" next /> : null}
          {c.pitch_due_at ? <Step when={fmtDate(c.pitch_due_at)} what="Pitch due, if you are shortlisted" /> : null}
        </View>
        <Button title="See your team" onPress={onTeam} />
        <Button title="Find another hackathon" kind="ghost" onPress={onMore} />
      </Screen>
    </View>
  );
}

function Step({ when, what, done, next }: { when: string; what: string; done?: boolean; next?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderTopWidth: done ? 2 : 1, borderTopColor: done ? t.ink : t.line }}>
      <Text style={{ width: 84, color: next ? t.redText : done ? t.muted : t.ink, fontFamily: F.display, fontSize: 17 }}>{when}</Text>
      <Text style={{ flex: 1, color: done ? t.muted : t.ink, fontSize: 15, fontWeight: next ? "700" : "600" }}>{what}</Text>
      {done ? <Text accessibilityLabel="Done" style={{ color: t.moss, fontSize: 18, fontWeight: "800" }}>✓</Text> : null}
    </View>
  );
}
