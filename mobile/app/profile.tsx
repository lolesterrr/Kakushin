import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Switch, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Redirect, useRouter } from "expo-router";
import { api, pdfUrl } from "../lib/api";
import { addToLinkedIn, shareCertificate } from "../lib/share";
import { FILL } from "../lib/theme";
import { F, topicLabel } from "../lib/fonts";
import { API_URL } from "../lib/config";
import { useAuth } from "../lib/auth";
import { registerForPush, type PushState } from "../lib/push";
import { setServerPushes, syncReminders } from "../lib/reminders";
import { certificates as certSchema, follows as followsSchema, myTeams, topics as topicsSchema, type Me } from "../lib/schemas";
import { abs, pickImage, uploadImage } from "../lib/media";
import { Avatar } from "../components/media";
import { fmtDate } from "../lib/format";
import { useLoad } from "../lib/useLoad";
import { useTheme } from "../lib/theme";
import { Body, Button, Card, Field, Folders, H2, Label, Notice, Offline, Pill, Screen, StatusStamp } from "../components/ui";

const TABS = ["About you", "Teams and certificates", "Notifications", "Account"];

export default function Profile() {
  const { me, reload, signOut } = useAuth();
  const t = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({ name: "", institution: "", location: "", skills: "", bio: "", handle: "" });
  const [isPublic, setIsPublic] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me) {
      setForm({ name: me.name ?? "", institution: me.institution ?? "", location: me.location ?? "", skills: me.skills.join(", "), bio: me.bio ?? "", handle: me.handle ?? "" });
      setIsPublic(!!me.public_profile);
    }
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const certs = useLoad(() => api("/certificates/mine", { schema: certSchema }), [me?.id], { cache: me ? `certs.${me.id}` : null });
  const teams = useLoad(() => api("/teams/mine", { schema: myTeams }), [me?.id], { cache: me ? `teams.${me.id}` : null });
  const all = useLoad(() => api("/challenges/topics", { schema: topicsSchema }), []);
  const fol = useLoad(() => api("/follows", { schema: followsSchema }), []);
  const [mine, setMine] = useState<string[] | null>(null);
  const topicsNow = mine ?? fol.data?.topics ?? [];

  async function toggle(x: string) {
    const next = topicsNow.includes(x) ? topicsNow.filter((y) => y !== x) : [...topicsNow, x];
    setMine(next);
    try { await api("/follows/topics", { method: "PUT", json: { topics: next } }); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  async function save() {
    setMsg(null); setBusy(true);
    try {
      const handle = form.handle.trim().toLowerCase();
      await api("/me", { method: "PUT", json: { name: form.name, institution: form.institution, location: form.location, bio: form.bio, skills: form.skills.split(",").map((x) => x.trim()).filter(Boolean), handle: handle || null, public_profile: isPublic && !!handle } });
      await reload(); setMsg({ kind: "ok", text: "Saved" });
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  const settings = useLoad(() => api<{ push: boolean; devices: number }>("/inbox/settings"), []);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const pushNow = pushOn ?? settings.data?.push ?? true;
  async function setPush(on: boolean) {
    setPushOn(on); setMsg(null);
    try {
      await api("/inbox/settings", { method: "PUT", json: { push: on } });
      const state = on ? await registerForPush() : null;
      if (state) setPushState(state);
      // With server pushes off (or unavailable here), the phone keeps its own deadline reminders instead.
      setServerPushes(on && state === "ready");
      void api("/teams/mine", { schema: myTeams }).then((r) => syncReminders(r.teams)).catch(() => {});
    } catch (e) { setPushOn(!on); setMsg({ kind: "err", text: (e as Error).message }); }
  }
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  if (!me) return <Redirect href={{ pathname: "/sign-in", params: { next: "/profile" } } as never} />;

  const myTeamList = teams.data?.teams ?? [];
  const finals = myTeamList.filter((x) => x.status === "finalist" || x.status === "winner").length;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <Screen flush onRefresh={() => { void certs.refresh(); void teams.refresh(); void fol.refresh(); void settings.refresh(); void reload(); }} refreshing={certs.refreshing}>
      <ProfileHero me={me} onChanged={reload} onPublicTap={() => setTab(0)} />
      <View style={{ flexDirection: "row", gap: 20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 }}>
        <Stat n={pad(myTeamList.length)} label="Challenges" big />
        <Stat n={pad(certs.data?.certificates.length ?? 0)} label="Certificates" />
        <Stat n={pad(finals)} label="Finals" />
      </View>
      <Folders tabs={TABS} value={tab} onChange={setTab} />
      <View style={{ padding: 16, gap: 12 }}>
        {tab === 0 ? (
          <>
            <H2>About you</H2>
            <Body muted>Organisers see this when you apply. Only your name is required.</Body>
            <Field label="Name" value={form.name} onChangeText={set("name")} autoComplete="name" />
            <Field label="Institution" value={form.institution} onChangeText={set("institution")} />
            <Field label="Location" value={form.location} onChangeText={set("location")} />
            <Field label="Skills (comma separated)" value={form.skills} onChangeText={set("skills")} autoCapitalize="none" />
            <Field label="Bio" value={form.bio} onChangeText={set("bio")} multiline />
            <H2>Public profile</H2>
            <Body muted>A page anyone can open, with your teams and certificates. Your email is never shown.</Body>
            <Field label="Profile address" value={form.handle} onChangeText={set("handle")} autoCapitalize="none" autoCorrect={false} placeholder="your-name" />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700", flex: 1 }}>Make my profile public</Text>
              <Switch value={isPublic} onValueChange={setIsPublic} />
            </View>
            {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
            <Button title="Save profile" onPress={save} busy={busy} disabled={!form.name.trim()} />
          </>
        ) : null}

        {tab === 1 ? (
          <>
            <H2>Your teams</H2>
            {teams.stale ? <Offline /> : null}
            {myTeamList.length ? myTeamList.map((x) => (
              <Card key={x.id} onPress={() => router.push(`/challenge/${x.oslug}/${x.cslug}` as never)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Label>{x.oname}</Label>
                  <Text style={{ color: t.ink, fontFamily: F.display, fontSize: 18 }}>{x.title}</Text>
                  <Body muted style={{ fontSize: 14 }}>{x.name}</Body>
                </View>
                <StatusStamp status={x.status} />
              </Card>
            )) : <Body muted>No teams yet. Find a challenge and start one.</Body>}
            <H2>Your certificates</H2>
            {certs.stale ? <Offline /> : null}
            {certs.data && certs.data.certificates.length > 0 ? (
              <>
                {certs.data.certificates.map((c) => <CertificateCard key={c.code} c={c} />)}
                <Body muted style={{ fontSize: 13 }}>The name on a certificate is the one on your profile when you first open it, so set your name first.</Body>
              </>
            ) : <Body muted>Certificates show up here when an organiser issues them.</Body>}
          </>
        ) : null}

        {tab === 2 ? (
          <>
            <H2>Notifications</H2>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700" }}>Push notifications</Text>
                <Body muted>Get a ping on this phone for results, shortlists, certificates and new challenges. They always land in your inbox either way.</Body>
              </View>
              <Switch value={pushNow} onValueChange={(v) => void setPush(v)} />
            </View>
            {pushNow && pushState === "denied" ? <Notice kind="err">Notifications are blocked for Kakushin on this phone. Turn them on in your phone settings.</Notice> : null}
            {pushNow && pushState === "unsupported" ? <Notice kind="err">This phone could not register for push. It needs a real device, not a simulator or browser.</Notice> : null}
            <H2>What you want to hear about</H2>
            <Body muted>Pick topics and you get a note in your inbox when a new challenge matches.</Body>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {all.data?.topics.map((x) => <Pill key={x} text={topicLabel(x)} on={topicsNow.includes(x)} onPress={() => void toggle(x)} />)}
            </View>
            {fol.data && fol.data.orgs.length > 0 ? <Body muted>Following: {fol.data.orgs.map((o) => o.name).join(", ")}</Body> : null}
            {msg && tab === 2 ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
          </>
        ) : null}

        {tab === 3 ? (
          <>
            <H2>Account</H2>
            <Label>Signed in as</Label>
            <Text style={{ color: t.ink, fontFamily: F.mono, fontSize: 15 }}>{me.email}</Text>
            <View style={{ marginTop: 8 }}><Button title="Sign out" kind="ghost" onPress={() => void signOut()} /></View>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
              <Text accessibilityRole="link" style={{ color: t.muted, textDecorationLine: "underline" }} onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/privacy`)}>Privacy policy</Text>
              <Text accessibilityRole="link" style={{ color: t.muted, textDecorationLine: "underline" }} onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/terms`)}>Terms of use</Text>
            </View>
            <DeleteAccount email={me.email} onDeleted={signOut} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Stat({ n, label, big }: { n: string; label: string; big?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontFamily: F.display, fontSize: big ? 52 : 36, lineHeight: big ? 54 : 40, letterSpacing: -2, color: big ? FILL.red : t.muted }}>{n}</Text>
      <Text style={{ fontFamily: F.monoMed, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: t.ink }}>{label}</Text>
    </View>
  );
}

/**
 * The top of the profile: a banner (or the red sun when there is none), then a dark card with the picture, the name
 * in a handwritten box, and where they study and live. Picture and banner change from here.
 */
function ProfileHero({ me, onChanged, onPublicTap }: { me: Me; onChanged: () => Promise<void>; onPublicTap: () => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState<"avatar" | "banner" | null>(null);
  const [err, setErr] = useState("");
  async function change(kind: "avatar" | "banner") {
    setErr("");
    const img = await pickImage(kind === "avatar" ? [1, 1] : [3, 1]).catch(() => null);
    if (!img) return;
    setBusy(kind);
    try { await uploadImage(`/me/${kind}`, img, { maxMb: kind === "avatar" ? 2 : 4 }); await onChanged(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }
  async function remove(kind: "avatar" | "banner") {
    setErr(""); setBusy(kind);
    try { await api(`/me/${kind}`, { method: "DELETE" }); await onChanged(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  function menu(kind: "avatar" | "banner", has: boolean) {
    const what = kind === "avatar" ? "photo" : "banner";
    if (!has) return void change(kind);
    Alert.alert(kind === "avatar" ? "Profile photo" : "Banner", undefined, [
      { text: `Change ${what}`, onPress: () => void change(kind) },
      { text: `Remove ${what}`, style: "destructive", onPress: () => void remove(kind) },
      { text: "Cancel", style: "cancel" },
    ]);
  }
  const banner = abs(me.banner_url);
  return (
    <View style={{ overflow: "hidden", paddingBottom: 4 }}>
      {banner ? <Image source={{ uri: banner }} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 170, borderBottomWidth: 1.5, borderColor: t.ink }} />
        : <>
          <View style={{ position: "absolute", left: -60, top: -70, width: 240, height: 240, borderRadius: 120, backgroundColor: FILL.red }} />
          <View style={{ position: "absolute", left: 170, top: 6, width: 90, height: 90, borderRadius: 45, borderWidth: 1.5, borderColor: FILL.red }} />
        </>}
      <Pressable accessibilityRole="button" onPress={() => menu("banner", !!banner)} style={{ position: "absolute", right: 14, top: 12, zIndex: 2, backgroundColor: t.bg, borderWidth: 1.5, borderColor: t.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ fontFamily: F.monoMed, fontSize: 11, color: t.ink }}>{busy === "banner" ? "SAVING" : banner ? "BANNER" : "ADD BANNER"}</Text>
      </Pressable>
      <View style={{ marginTop: banner ? 120 : 96, marginHorizontal: 16, backgroundColor: "#2b2a28", borderRadius: 26, padding: 22, gap: 14 }}>
        <Text style={{ fontFamily: F.monoMed, fontSize: 10, letterSpacing: 1.6, color: "#c9c4b9" }}>{me.public_profile && me.handle ? "PUBLIC PROFILE" : "PRIVATE PROFILE"}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={me.avatar_url ? "Change or remove your photo" : "Add a photo"} onPress={() => menu("avatar", !!me.avatar_url)}>
            <Avatar name={me.name || me.email} url={me.avatar_url} size={76} ring="#f6f4ee" />
            {busy === "avatar" ? <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#fff" /></View> : null}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => menu("avatar", !!me.avatar_url)} style={{ borderWidth: 1.5, borderColor: "#f6f4ee", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: "#f6f4ee", fontWeight: "700", fontSize: 14 }}>{me.avatar_url ? "Change photo" : "Add a photo"}</Text>
          </Pressable>
        </View>
        <View style={{ alignSelf: "flex-start", borderWidth: 1.5, borderColor: "#f6f4ee", paddingHorizontal: 14, paddingBottom: 4 }}>
          <Text style={{ fontFamily: F.hand, fontSize: 40, lineHeight: 46, color: "#f6f4ee" }}>{me.name || "Your name"}</Text>
        </View>
        {me.institution || me.location ? <Text style={{ fontFamily: F.mono, fontSize: 13, color: "#f6f4ee" }}>{[me.institution, me.location].filter(Boolean).join("   ")}</Text> : null}
        {me.skills.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {me.skills.slice(0, 8).map((k) => <View key={k} style={{ borderWidth: 1, borderColor: "#f6f4ee", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: "#f6f4ee", fontSize: 12 }}>{k}</Text></View>)}
          </View>
        ) : null}
        {me.public_profile && me.handle
          ? <Text accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/u/${me.handle}`)} style={{ fontFamily: F.mono, fontSize: 13, color: "#f6f4ee", textDecorationLine: "underline" }}>{API_URL.replace(/^https?:\/\//, "")}/u/{me.handle}</Text>
          : <Text accessibilityRole="button" onPress={onPublicTap} style={{ color: "#dcd8cf", fontSize: 14, textDecorationLine: "underline" }}>Make your profile public below</Text>}
        {err ? <Text accessibilityRole="alert" style={{ color: "#ffb4a8", fontSize: 13 }}>{err}</Text> : null}
      </View>
    </View>
  );
}

type Cert = { code: string; kind: string; title: string; challenge: string; org: string; issued_at: number };

/** A certificate as a card: the award, the challenge and organiser, and the code that proves it. */
function CertificateCard({ c }: { c: Cert }) {
  const t = useTheme();
  const won = c.kind === "winner";
  return (
    <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, overflow: "hidden" }}>
      <View style={{ backgroundColor: won ? FILL.red : FILL.ink, paddingHorizontal: 18, paddingVertical: 16, gap: 4 }}>
        <Text style={{ color: "#ffffffcc", fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" }}>Certificate · {c.org}</Text>
        <Text style={{ color: "#fff", fontFamily: F.display, fontSize: 22, lineHeight: 26 }}>{c.title}</Text>
      </View>
      <View style={{ padding: 16, gap: 8 }}>
        <Text style={{ color: t.ink, fontSize: 17, fontWeight: "800" }}>{c.challenge}</Text>
        <Body muted style={{ fontSize: 14 }}>Issued {fmtDate(c.issued_at)} · Code {c.code}</Body>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <View style={{ flex: 1 }}><Button title="Share" onPress={() => void shareCertificate(c)} /></View>
          <View style={{ flex: 1 }}><Button title="Open PDF" kind="ghost" onPress={() => void WebBrowser.openBrowserAsync(pdfUrl(c.code))} /></View>
        </View>
        <Button title="Add to LinkedIn" kind="ghost" onPress={() => addToLinkedIn(c)} />
      </View>
    </View>
  );
}

/** Deleting is final, so it needs the email typed back and one more tap on a warning. */
function DeleteAccount({ email, onDeleted }: { email: string; onDeleted: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  async function remove() {
    setBusy(true); setErr("");
    try {
      await api("/me", { method: "DELETE", json: { confirm: typed } });
      try { await onDeleted(); } catch { /* the session is already gone */ }
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  function ask() {
    Alert.alert("Delete your account?", "This removes your profile, team places, certificates and inbox for good. It cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void remove() },
    ]);
  }
  if (!open) return <View style={{ marginTop: 24 }}><Button title="Delete my account" kind="ghost" onPress={() => setOpen(true)} /></View>;
  return (
    <>
      <H2>Delete your account</H2>
      <Body>This removes your profile, sign-in, devices, your place in every team, your certificates (they stop verifying), your inbox and follows, and any scores you gave as a judge.</Body>
      <Body muted>A team you lead passes to the teammate who joined first. A team with only you in it is removed. If you own an organisation, another admin takes it over.</Body>
      <Field label="Type your email address to confirm" value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder={email} />
      {err ? <Notice kind="err">{err}</Notice> : null}
      <Button title="Delete my account for good" onPress={ask} busy={busy} disabled={!matches} />
      <Button title="Cancel" kind="ghost" onPress={() => { setOpen(false); setTyped(""); setErr(""); }} />
    </>
  );
}
