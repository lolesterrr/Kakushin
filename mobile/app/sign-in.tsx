import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { API_URL } from "../lib/config";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { Banner } from "../components/Banner";
import { Turnstile } from "../components/Turnstile";
import { api } from "../lib/api";
import { Body, Button, Field, H1, Hand, Notice } from "../components/ui";
import { shadow } from "../lib/theme";
import { RedLight } from "../components/RedLight";

export default function SignIn() {
  const { me, ready, requestCode, verify } = useAuth();
  const t = useTheme();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // When the server has Turnstile on, a request needs a fresh one-use token from the widget. `check` remounts it.
  const [needsCheck, setNeedsCheck] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [check, setCheck] = useState(0);
  useEffect(() => {
    api<{ turnstile_site_key: string | null }>("/auth/config").then((r) => setNeedsCheck(!!r.turnstile_site_key)).catch(() => {});
  }, []);
  const newCheck = () => { setToken(null); setCheck((n) => n + 1); };

  if (ready && me) return <Redirect href="/" />;

  async function send() {
    if (needsCheck && !token) { setErr("Wait for the check below to finish, then try again."); return; }
    setErr(""); setBusy(true);
    try { await requestCode(email, token ?? undefined); setStep("code"); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); if (needsCheck) newCheck(); }
  }
  async function confirm(c = code) {
    if (c.length !== 6) return;
    setErr(""); setBusy(true);
    try { await verify(email, c); }
    catch (e) { setErr((e as Error).message); setCode(""); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Banner seed="kakushin-sign-in" label="Kakushin" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 330 }} />
      <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 }}>
          <RedLight size={14} />
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#111111" }}>Kakushin</Text>
        </View>
      </SafeAreaView>
      <View style={[{ flex: 1, marginTop: 290, backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 32, gap: 16 }, shadow(0.3)]}>
        {step === "code" ? <Hand>Check your email</Hand> : <Hand>Welcome</Hand>}
        <H1>{step === "email" ? "Sign in or create your account" : "Enter your code"}</H1>
        {step === "email" ? (
          <>
            <Body muted>No password. We email you a 6-digit code. New here? Your account is created when you confirm it.</Body>
            {/* Gmail is blocking mail from our current free domain, so steer people to an address that receives it. */}
            <Notice kind="ok">Use your school or work email. Codes sent to Gmail addresses may not arrive at the moment.</Notice>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" onSubmitEditing={send} />
            {needsCheck ? <Turnstile key={check} onToken={setToken} /> : null}
            {err ? <Notice kind="err">{err}</Notice> : null}
            <Button title="Email me a code" onPress={send} busy={busy} disabled={!email.includes("@") || (needsCheck && !token)} />
            <Text style={{ color: t.muted, fontSize: 13, lineHeight: 19 }}>
              By continuing you agree to the{" "}
              <Text accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/terms`)}>terms of use</Text> and the{" "}
              <Text accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/privacy`)}>privacy policy</Text>.
            </Text>
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
    </View>
  );
}
