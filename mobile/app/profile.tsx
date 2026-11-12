import React, { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api, pdfUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { registerForPush, type PushState } from "../lib/push";
import { certificates as certSchema, follows as followsSchema, topics as topicsSchema } from "../lib/schemas";
import { fmtDate } from "../lib/format";
import { useLoad } from "../lib/useLoad";
import { useTheme } from "../lib/theme";
import { Body, Button, Card, Field, H2, Notice, Pill, Screen } from "../components/ui";

export default function Profile() {
  const { me, reload, signOut } = useAuth();
  const t = useTheme();
  const [form, setForm] = useState({ name: "", institution: "", location: "", skills: "", bio: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me) setForm({ name: me.name ?? "", institution: me.institution ?? "", location: me.location ?? "", skills: me.skills.join(", "), bio: me.bio ?? "" });
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const certs = useLoad(() => api("/certificates/mine", { schema: certSchema }), []);
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
      await api("/me", { method: "PUT", json: { name: form.name, institution: form.institution, location: form.location, bio: form.bio, skills: form.skills.split(",").map((x) => x.trim()).filter(Boolean) } });
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
      if (on) setPushState(await registerForPush());
    } catch (e) { setPushOn(!on); setMsg({ kind: "err", text: (e as Error).message }); }
  }
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <Screen onRefresh={() => { void certs.refresh(); void fol.refresh(); void settings.refresh(); }} refreshing={certs.refreshing}>
      <Text style={{ color: t.muted }}>{me?.email}</Text>

      {certs.data && certs.data.certificates.length > 0 ? (
        <>
          <H2>Your certificates</H2>
          {certs.data.certificates.map((c) => (
            <Card key={c.code}>
              <Text style={{ color: t.ink, fontSize: 17, fontWeight: "800" }}>{c.challenge}</Text>
              <Body muted>{c.org} · {c.title} · {fmtDate(c.issued_at)}</Body>
              <View style={{ marginTop: 8 }}><Button title="Open certificate" kind="ghost" onPress={() => void WebBrowser.openBrowserAsync(pdfUrl(c.code))} /></View>
            </Card>
          ))}
          <Body muted style={{ fontSize: 13 }}>The name on a certificate is the one on your profile when you first open it, so set your name first.</Body>
        </>
      ) : null}

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
        {all.data?.topics.map((x) => <Pill key={x} text={x} on={topicsNow.includes(x)} onPress={() => void toggle(x)} />)}
      </View>
      {fol.data && fol.data.orgs.length > 0 ? <Body muted>Following: {fol.data.orgs.map((o) => o.name).join(", ")}</Body> : null}

      <H2>Your profile</H2>
      <Field label="Name" value={form.name} onChangeText={set("name")} autoComplete="name" />
      <Field label="Institution" value={form.institution} onChangeText={set("institution")} />
      <Field label="Location" value={form.location} onChangeText={set("location")} />
      <Field label="Skills (comma separated)" value={form.skills} onChangeText={set("skills")} autoCapitalize="none" />
      <Field label="Bio" value={form.bio} onChangeText={set("bio")} multiline />
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <Button title="Save profile" onPress={save} busy={busy} disabled={!form.name.trim()} />
      <View style={{ marginTop: 16 }}><Button title="Sign out" kind="ghost" onPress={() => void signOut()} /></View>
    </Screen>
  );
}
