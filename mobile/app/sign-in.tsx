import React, { useState } from "react";
import { Text, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { Body, Button, Field, H1, Notice } from "../components/ui";

export default function SignIn() {
  const { me, ready, requestCode, verify } = useAuth();
  const t = useTheme();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (ready && me) return <Redirect href="/" />;

  async function send() {
    setErr(""); setBusy(true);
    try { await requestCode(email); setStep("code"); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function confirm(c = code) {
    if (c.length !== 6) return;
    setErr(""); setBusy(true);
    try { await verify(email, c); }
    catch (e) { setErr((e as Error).message); setCode(""); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#c8321f" }} />
          <Text style={{ fontSize: 22, fontWeight: "800", color: t.ink }}>Kakushin</Text>
        </View>
        <H1>{step === "email" ? "Sign in or create your account" : "Enter your code"}</H1>
        {step === "email" ? (
          <>
            <Body muted>No password. We email you a 6-digit code. New here? Your account is created when you confirm it.</Body>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" onSubmitEditing={send} />
            {err ? <Notice kind="err">{err}</Notice> : null}
            <Button title="Email me a code" onPress={send} busy={busy} disabled={!email.includes("@")} />
          </>
        ) : (
          <>
            <Body muted>We sent a code to {email}. It works for 15 minutes.</Body>
            <Field label="6-digit code" value={code} onChangeText={(v) => { const d = v.replace(/\D/g, "").slice(0, 6); setCode(d); if (d.length === 6) void confirm(d); }}
              autoFocus keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} />
            {err ? <Notice kind="err">{err}</Notice> : null}
            <Button title="Sign in" onPress={() => void confirm()} busy={busy} disabled={code.length !== 6} />
            <Button title="Use a different email" kind="ghost" onPress={() => { setStep("email"); setCode(""); setErr(""); }} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
