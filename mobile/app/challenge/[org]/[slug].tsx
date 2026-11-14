import React, { useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { toSignIn } from "../../../lib/nav";
import { shareInvite } from "../../../lib/share";
import { challengeDetail, follows as followsSchema, teamResponse, type ChallengeDetail, type Team } from "../../../lib/schemas";
import { clock, daysLeft, fmtDate, teamSize } from "../../../lib/format";
import { useLoad } from "../../../lib/useLoad";
import { useTheme } from "../../../lib/theme";
import { Banner, Scrim } from "../../../components/Banner";
import { Markdown } from "../../../components/Markdown";
import { API_URL } from "../../../lib/config";
import { F, topicLabel } from "../../../lib/fonts";
import { shadow } from "../../../lib/theme";
import { Body, Button, Card, DaysStamp, H2, Label, Loading, Notice, Offline, Pill, Screen, StatusStamp } from "../../../components/ui";
import { Recap } from "../../../components/projects";
import { SaveFab } from "../../../components/events";
import { addToCalendar, setSaved } from "../../../lib/saved";

export default function ChallengeScreen() {
  const { org, slug } = useLocalSearchParams<{ org: string; slug: string }>();
  const t = useTheme();
  const router = useRouter();
  const { me } = useAuth();
  const base = `/orgs/${org}/challenges/${slug}`;
  const here = `/challenge/${org}/${slug}`;
  const ch = useLoad(async () => { const r = await api(base, { schema: challengeDetail }); return { ...r.challenge, role: r.role ?? null, saved: !!r.saved }; }, [base, me?.id], { cache: `challenge.${org}.${slug}` });
  // Signed out, there is no team or follow to load: the screen still shows everything else.
  const tm = useLoad(async () => (me ? (await api(`${base}/team`, { schema: teamResponse })).team : null), [base, me?.id]);
  const fol = useLoad(async () => (me ? await api("/follows", { schema: followsSchema }) : null), [me?.id]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const c = ch.data;
  const following = !!fol.data?.orgs.some((o) => o.slug === org);
  async function toggleFollow() {
    if (!me) { toSignIn(router, here); return; }
    try { await api(`/follows/orgs/${org}`, { method: following ? "DELETE" : "PUT" }); await fol.reload(); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  const refresh = async () => { await Promise.all([ch.refresh(), tm.refresh()]); };
  const insets = useSafeAreaInsets();
  const [mine, setMine] = useState<boolean | null>(null);
  const saved = mine ?? !!ch.data?.saved;
  async function toggleSave() {
    if (!me) { toSignIn(router, here); return; }
    const next = !saved;
    setMine(next); setMsg(null);
    try { await setSaved(`challenges/${org}/${slug}`, next); } catch (e) { setMine(!next); setMsg({ kind: "err", text: (e as Error).message }); }
  }

  if (!c) return <Screen><Stack.Screen options={{ headerShown: false }} />{ch.err ? <Notice kind="err">{ch.err === "Not found" ? "We could not find that challenge." : ch.err}</Notice> : <Loading />}</Screen>;
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
              <Text numberOfLines={1} accessibilityRole="link" accessibilityHint="Opens the organisation" onPress={() => router.push(`/org/${org}`)} style={{ flex: 1, color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", textDecorationLine: "underline" }}>{c.org.name}</Text>
            </View>
            <Pressable onPress={toggleFollow} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: t.ink, justifyContent: "center" }}>
              <Text style={{ color: t.ink, fontSize: 13, fontWeight: "700" }}>{following ? "Following" : "Follow"}</Text>
            </Pressable>
          </View>
          {ch.stale ? <Offline /> : null}
          <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6 }}>{c.title}</Text>
          {c.summary ? <Body muted>{c.summary}</Body> : null}
          {c.topics.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{c.topics.map((x) => <Pill key={x} text={topicLabel(x)} />)}</View> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {c.applications_close_at ? <View style={{ flex: 1, backgroundColor: t.card, borderWidth: 1.5, borderColor: t.ink, borderRadius: 14, padding: 12 }}><Label>Closes</Label><Text style={{ color: t.ink, fontFamily: F.display, fontSize: 19 }}>{fmtDate(c.applications_close_at)}</Text></View> : null}
            <View style={{ flex: 1, backgroundColor: t.card, borderWidth: 1.5, borderColor: t.ink, borderRadius: 14, padding: 12 }}><Label>Team</Label><Text style={{ color: t.ink, fontFamily: F.display, fontSize: 19 }}>{teamSize(c.team_min, c.team_max)}</Text></View>
            {c.pitch_due_at ? <View style={{ flex: 1, backgroundColor: "#111111", borderRadius: 14, padding: 12 }}><Label>Pitch</Label><Text style={{ color: "#F6F4EE", fontFamily: F.display, fontSize: 19 }}>{fmtDate(c.pitch_due_at)}</Text></View> : null}
          </View>
          {d !== null && d > 0 ? <View style={{ flexDirection: "row" }}><DaysStamp days={d} tilt={-2} /></View> : null}

      {c.description ? <><H2>About</H2><Markdown text={c.description} /></> : null}
      {c.rules ? <><H2>Rules</H2><Markdown text={c.rules} /></> : null}
      <Timeline c={c} />
      {c.prizes ? <><H2>Prizes</H2><Markdown text={c.prizes} /></> : null}
      {c.judges.length ? (
        <>
          <H2>Judges</H2>
          {c.judges.map((j, i) => <Body key={i}><Text style={{ fontWeight: "700" }}>{j.name}</Text>{j.title ? <Text style={{ color: t.muted }}>  ·  {j.title}</Text> : null}</Body>)}
        </>
      ) : null}
      {c.sponsors.length ? (
        <>
          <H2>Sponsors</H2>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            {c.sponsors.map((x, i) => (
              <Pressable key={i} disabled={!x.url} onPress={() => x.url && void Linking.openURL(x.url)} accessibilityRole={x.url ? "link" : undefined} accessibilityLabel={x.name}>
                {x.logo_url ? <Image source={{ uri: `${API_URL}${x.logo_url}` }} style={{ width: 120, height: 48 }} resizeMode="contain" /> : <Text style={{ color: t.ink, fontWeight: "700", fontSize: 16 }}>{x.name}</Text>}
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {c.faq.length ? (
        <>
          <H2>FAQ</H2>
          {c.faq.map((x, i) => <Faq key={i} q={x.q} a={x.a} />)}
        </>
      ) : null}
      {c.criteria.length ? (
        <>
          <H2>How you will be scored</H2>
          <Body muted>Judges score each pitch on these. The weight is how much each counts.</Body>
          {c.criteria.map((r) => (
            <View key={r.name} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: t.line, paddingVertical: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700" }}>{r.name}</Text>
                {r.description ? <Body muted>{r.description}</Body> : null}
              </View>
              <Text accessibilityLabel={`${r.weight} percent of the score`} style={{ color: t.ink, fontFamily: F.display, fontSize: 20 }}>{r.weight}%</Text>
            </View>
          ))}
        </>
      ) : null}

      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      {c.results_published ? <Button title="See the results and projects" onPress={() => router.push(`/results/${org}/${slug}`)} /> : null}
      {(c.status === "judging" || c.status === "completed") && !c.results_published ? <Recap base={`/orgs/${org}/challenges/${slug}`} /> : null}
      {c.status !== "draft" && c.status !== "completed" && (c.agenda.length > 0 || c.checkin_enabled || c.role) ? (
        <>
          <H2>Event day</H2>
          {c.agenda.length > 0 ? <Button title="Open the live page" onPress={() => router.push(`/live/${org}/${slug}`)} /> : null}
          {c.checkin_enabled && tm.data && tm.data.status !== "rejected" ? <Button title="My check-in pass" kind="ghost" onPress={() => router.push(`/pass/${org}/${slug}`)} /> : null}
          {c.checkin_enabled && c.role ? <Button title="Check people in" kind="ghost" onPress={() => router.push(`/checkin/${org}/${slug}`)} /> : null}
          {c.role && !c.checkin_enabled && !c.agenda.length ? <Body muted>Add an agenda or turn on check-in from Event day on the web.</Body> : null}
        </>
      ) : null}
      <TeamPanel org={org} slug={slug} c={c} team={tm.data} loaded={teamLoaded} signedIn={!!me} onChange={refresh} />
      {c.status !== "draft" && c.status !== "completed" && (c.applications_close_at || c.pitch_due_at || c.agenda.length > 0) ? (
        <Button title="Add the dates to my calendar" kind="ghost" onPress={() => void addToCalendar(`orgs/${org}/challenges/${slug}`).catch(() => setMsg({ kind: "err", text: "Could not open the calendar." }))} />
      ) : null}
      {c.status !== "draft" && !c.role ? (
        <Text accessibilityRole="button" onPress={() => (me ? router.push({ pathname: "/report", params: { kind: "challenge", org, slug, title: c.title } } as never) : toSignIn(router, here))}
          style={{ color: t.muted, fontSize: 14, textDecorationLine: "underline", paddingVertical: 10 }}>Something wrong? Report this challenge</Text>
      ) : null}
        </View>
      </Screen>
      <BackButton />
      {c.status !== "draft" ? <SaveFab saved={saved} onPress={() => void toggleSave()} top={insets.top + 8} /> : null}
    </View>
  );
}

function TeamPanel({ org, slug, c, team, loaded, signedIn, onChange }: { org: string; slug: string; c: ChallengeDetail; team: Team | null; loaded: boolean; signedIn: boolean; onChange: () => Promise<void> }) {
  const t = useTheme();
  const router = useRouter();
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
    const apply = `/apply/${org}/${slug}`;
    if (!signedIn) {
      return (
        <>
          <Button title="Apply now" onPress={() => toSignIn(router, apply)} />
          <Body muted style={{ fontSize: 13 }}>You sign in with your email first. It takes a minute, and you come straight back here.</Body>
        </>
      );
    }
    return <Button title="Apply now" onPress={() => router.push(apply)} />;
  }

  const canApply = team.is_lead && (team.status === "forming" || team.status === "applied") && open;
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
            <Body muted style={{ fontSize: 13 }}>Send the invite link. It opens the app, or the web page for anyone without it.</Body>
            <View style={{ marginTop: 6 }}><Button title="Share invite" kind="ghost" onPress={() => void shareInvite(team, c.title)} /></View>
          </>
        ) : null}
      </Card>

      {canApply ? (
        <Button title={team.status === "applied" ? "Edit your application" : "Continue your application"} onPress={() => router.push(`/apply/${org}/${slug}`)} />
      ) : null}
      {!team.is_lead && team.status === "forming" ? <Body muted>Your team lead sends the application.</Body> : null}
      {team.status === "applied" && !canApply ? <Body muted>Received. The organisers will review your application.</Body> : null}
      {c.status !== "completed" && ["shortlisted", "finalist", "winner"].includes(team.status) ? (
        <>
          <H2>Your pitch</H2>
          <Body muted>Upload your deck and add a video or demo link{c.pitch_due_at ? ` by ${fmtDate(c.pitch_due_at)}` : ""}. Anyone on the team can do it.</Body>
          <Button title="Open your pitch" onPress={() => router.push({ pathname: "/pitch/[team]", params: { team: team.id, name: team.name } } as never)} />
        </>
      ) : null}
      {c.status === "completed" && ["shortlisted", "finalist", "winner"].includes(team.status) ? <Button title="Get your certificate" onPress={() => router.push("/profile")} /> : null}
      {team.status === "forming" || team.status === "applied" ? (
        <Button title="Leave team" kind="ghost" busy={busy} onPress={() => void run(() => api(`/teams/${team.id}/leave`, { method: "POST" }), "You left the team")} />
      ) : null}
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
    </>
  );
}

/** The application and pitch dates plus the organiser's own, in order. Past steps are faded. */
function Timeline({ c }: { c: ChallengeDetail }) {
  const t = useTheme();
  const rows = [...c.timeline];
  if (c.applications_open_at) rows.push({ label: "Applications open", at: c.applications_open_at });
  if (c.applications_close_at) rows.push({ label: "Applications close", at: c.applications_close_at });
  if (c.pitch_due_at) rows.push({ label: "Pitches due", at: c.pitch_due_at });
  for (const b of c.agenda) rows.push({ label: `${clock(b.starts_at)} to ${clock(b.ends_at)}  ${b.label}`, at: b.starts_at });
  rows.sort((a, b) => a.at - b.at);
  if (rows.length < 2 && !c.timeline.length) return null;
  return (
    <>
      <H2>Timeline</H2>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12, opacity: r.at < Date.now() ? 0.55 : 1 }}>
          <Text style={{ color: t.muted, fontSize: 14, width: 96 }}>{fmtDate(r.at)}</Text>
          <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600", flex: 1 }}>{r.label}</Text>
        </View>
      ))}
    </>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: t.line, paddingVertical: 10, gap: 8 }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700", flex: 1 }}>{q}</Text>
        <Text style={{ color: t.muted, fontSize: 18 }}>{open ? "−" : "+"}</Text>
      </Pressable>
      {open ? <Markdown text={a} /> : null}
    </View>
  );
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
