import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { FILL, useTheme } from "../lib/theme";
import { Body, Button, Field, H2, Notice, Screen } from "../components/ui";

const REASONS: [string, string][] = [["spam", "It is spam or a joke"], ["scam", "It looks like a scam"], ["offensive", "It is offensive or harmful"], ["wrong", "The details are wrong or out of date"], ["other", "Something else"]];

/** "Something is wrong with this": a short form that goes to the Kakushin team, for a challenge or a global event. */
export default function Report() {
  const { kind, org, slug, title } = useLocalSearchParams<{ kind: string; org?: string; slug: string; title?: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  if (!me) return <Redirect href={{ pathname: "/sign-in" } as never} />;
  async function send() {
    setBusy(true); setErr("");
    try { await api("/reports", { method: "POST", json: { kind: kind === "challenge" ? "challenge" : "event", org, slug, reason, details } }); setDone(true); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  if (done) {
    return (
      <Screen>
        <H2>Thanks for telling us</H2>
        <Body muted>The Kakushin team will take a look. If it breaks the rules it comes off the list.</Body>
        <Button title="Done" onPress={() => router.back()} />
      </Screen>
    );
  }
  return (
    <Screen>
      <H2>What is wrong with it?</H2>
      {title ? <Body muted>{title}</Body> : null}
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {REASONS.map(([v, label]) => {
          const on = reason === v;
          return (
            <Pressable key={v} onPress={() => setReason(v)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 14, borderWidth: 1.5, borderColor: t.ink, backgroundColor: on ? t.ink : t.card, borderRadius: 14 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: on ? 0 : 1.5, borderColor: t.ink, backgroundColor: on ? FILL.red : "transparent" }} />
              <Text style={{ color: on ? t.bg : t.ink, fontSize: 16, fontWeight: "600", flex: 1 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Anything that helps us check (optional)" value={details} onChangeText={setDetails} multiline maxLength={500} />
      {err ? <Notice kind="err">{err}</Notice> : null}
      <Button title="Send report" disabled={!reason} busy={busy} onPress={() => void send()} />
      <Body muted style={{ fontSize: 13 }}>Reports go to the Kakushin team, not to the organiser.</Body>
    </Screen>
  );
}
