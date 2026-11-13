import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { markOnboarded, savePrefs } from "../lib/prefs";
import { suggestOrgs } from "../lib/rank";
import { challengeList, topics as topicsSchema } from "../lib/schemas";
import { F } from "../lib/fonts";
import { useLoad } from "../lib/useLoad";
import { shadow, useTheme } from "../lib/theme";
import { OrgLogo } from "../components/OrgLogo";
import { RedLight } from "../components/RedLight";
import { Body, Button, Hand, Loading, Notice, Pill, Screen } from "../components/ui";

/** First run: pick topics, then follow two or three organisations. Both can be changed later in Profile. */
export default function Welcome() {
  const router = useRouter();
  const t = useTheme();
  const { me } = useAuth();
  const [step, setStep] = useState<0 | 1>(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const all = useLoad(() => api("/challenges/topics", { schema: topicsSchema }), [], { cache: "topics" });
  const list = useLoad(() => api("/challenges", { schema: challengeList }), [], { cache: "explore.all" });
  const suggestions = useMemo(() => suggestOrgs(list.data?.challenges ?? [], picked), [list.data, picked]);
  // Start with the suggestions ticked, so one tap on Done follows them; people untick what they do not want.
  const chosen = orgs ?? suggestions.map((s) => s.slug);

  const toggleTopic = (x: string) => setPicked((p) => (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]));
  const toggleOrg = (slug: string) => setOrgs(chosen.includes(slug) ? chosen.filter((y) => y !== slug) : [...chosen, slug]);

  async function finish(save: boolean) {
    setBusy(true); setErr("");
    try {
      if (save) {
        if (me) {
          // Signed in: straight to the account, adding to anything already followed.
          const now = await api<{ topics: string[] }>("/follows");
          await api("/follows/topics", { method: "PUT", json: { topics: [...new Set([...(now.topics ?? []), ...picked])] } });
          for (const o of chosen) await api(`/follows/orgs/${o}`, { method: "PUT" });
        } else {
          await savePrefs({ topics: picked, orgs: chosen });
        }
      }
      await markOnboarded();
      router.replace("/");
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <RedLight size={12} />
            <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>Kakushin</Text>
          </View>
          <Text accessibilityRole="button" onPress={() => void finish(false)} style={{ color: t.muted, fontSize: 15, fontWeight: "700", padding: 8 }}>Skip</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 2, now: step + 1 }}>
          {[0, 1].map((i) => <View key={i} style={{ flex: 1, height: 6, backgroundColor: i <= step ? "#c8321f" : t.line }} />)}
        </View>
      </SafeAreaView>

      <Screen>
        {step === 0 ? (
          <>
            <Hand>Welcome</Hand>
            <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 32, lineHeight: 35 }}>What do you like building?</Text>
            <Body muted>Pick a few. We put matching challenges first and tell you when a new one opens.</Body>
            {!all.data ? (all.err ? <Notice kind="err">{all.err}</Notice> : <Loading />) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {all.data.topics.map((x) => <Pill key={x} text={x} on={picked.includes(x)} onPress={() => toggleTopic(x)} />)}
              </View>
            )}
            <Button title={picked.length ? "Next" : "Pick at least one"} disabled={!picked.length} onPress={() => { setOrgs(null); setStep(1); }} />
          </>
        ) : (
          <>
            <Hand>Nearly there</Hand>
            <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 32, lineHeight: 35 }}>Follow a few organisers</Text>
            <Body muted>{me ? "You get a note when they open a new challenge." : "You get a note when they open a new challenge. We follow them for you when you sign in."}</Body>
            {!list.data && !list.err ? <Loading /> : null}
            {list.data && suggestions.length === 0 ? <Body muted>No organisers have open challenges right now. You can follow them later from any challenge.</Body> : null}
            {suggestions.map((s) => {
              const on = chosen.includes(s.slug);
              return (
                <Pressable key={s.slug} onPress={() => toggleOrg(s.slug)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Follow ${s.name}`}
                  style={[{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: t.card, borderWidth: on ? 2 : 1, borderColor: on ? t.ink : t.line, borderRadius: 16, padding: 14 }, shadow(0.08)]}>
                  <OrgLogo url={s.logo_url} name={s.name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 16, fontWeight: "800" }}>{s.name}</Text>
                    <Body muted style={{ fontSize: 14 }}>{s.open} open {s.open === 1 ? "challenge" : "challenges"}</Body>
                  </View>
                  <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: t.ink, backgroundColor: on ? t.ink : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {on ? <Text style={{ color: t.bg, fontSize: 15, fontWeight: "900" }}>✓</Text> : null}
                  </View>
                </Pressable>
              );
            })}
            {err ? <Notice kind="err">{err}</Notice> : null}
            <Button title="Start exploring" busy={busy} onPress={() => void finish(true)} />
            <Button title="Back" kind="ghost" onPress={() => setStep(0)} />
          </>
        )}
      </Screen>
    </View>
  );
}
