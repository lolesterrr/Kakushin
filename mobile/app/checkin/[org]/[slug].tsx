import React, { useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "../../../lib/api";
import { checkinList, checkinResult } from "../../../lib/schemas";
import { clock } from "../../../lib/format";
import { useLoad } from "../../../lib/useLoad";
import { FILL, useTheme } from "../../../lib/theme";
import { F } from "../../../lib/fonts";
import { Body, Button, Card, Field, H2, Loading, Notice, Screen } from "../../../components/ui";

type Msg = { kind: "ok" | "err"; text: string } | null;

/** Organisers scan passes at the door, or check someone in by name if their phone is dead. */
export default function CheckinScreen() {
  const { org, slug } = useLocalSearchParams<{ org: string; slug: string }>();
  const base = `/orgs/${org}/challenges/${slug}/checkin`;
  const t = useTheme();
  const list = useLoad(() => api(base, { schema: checkinList }), [base]);
  const [perm, ask] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [q, setQ] = useState("");
  const busy = useRef(false), last = useRef({ code: "", at: 0 });

  async function check(json: { code: string } | { user_id: string }) {
    busy.current = true;
    try {
      const r = await api(base, { method: "POST", json, schema: checkinResult });
      setMsg({ kind: "ok", text: r.already ? `${r.name} (${r.team}) was already checked in at ${clock(r.checked_in_at)}` : `${r.name} (${r.team}) is checked in` });
      await list.reload();
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { busy.current = false; }
  }
  function onScan({ data }: { data: string }) {
    const now = Date.now();
    // The camera reports the same code many times a second: handle each pass once, and pause between scans.
    if (busy.current || (data === last.current.code && now - last.current.at < 4000)) return;
    last.current = { code: data, at: now };
    void check({ code: data });
  }

  if (!list.data) return <Screen>{list.err ? <Notice kind="err">{list.err}</Notice> : <Loading />}</Screen>;
  const d = list.data;
  const people = d.people.filter((p) => !q || `${p.name} ${p.team}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen onRefresh={list.refresh} refreshing={list.refreshing}>
      <Stack.Screen options={{ title: "Check-in" }} />
      <Text style={{ color: t.ink, fontFamily: F.display, fontSize: 34 }}>{d.checked_in}/{d.total} <Text style={{ fontSize: 18 }}>checked in</Text></Text>
      {!d.enabled ? <Notice kind="err">Check-in is off for this challenge. Turn it on from Event day on the web.</Notice> : Platform.OS === "web" ? <Body muted>Scanning works in the phone app. You can still check people in by name below.</Body> : !perm?.granted ? (
        <Button title={perm?.canAskAgain === false ? "Allow the camera in Settings" : "Allow the camera to scan passes"} onPress={() => void ask()} />
      ) : scanning ? (
        <View style={{ height: 320, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onScan} />
          <Pressable onPress={() => setScanning(false)} accessibilityRole="button" style={{ position: "absolute", right: 12, top: 12, backgroundColor: "#111111cc", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Stop</Text>
          </Pressable>
        </View>
      ) : <Button title="Scan passes" onPress={() => { setMsg(null); setScanning(true); }} />}
      {msg ? <View style={{ backgroundColor: msg.kind === "ok" ? FILL.moss : FILL.red, borderRadius: 14, padding: 14 }} accessibilityRole="alert"><Text style={{ color: "#fff", fontSize: 17, fontWeight: "800" }}>{msg.text}</Text></View> : null}

      <H2>By name</H2>
      <Field label="Find a person or team" value={q} onChangeText={setQ} autoCorrect={false} />
      {people.map((p) => (
        <Card key={p.user_id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: "800" }}>{p.name}</Text>
              <Body muted style={{ fontSize: 13 }}>{p.team}{p.checked_in_at ? ` · in at ${clock(p.checked_in_at)}` : ""}</Body>
            </View>
            {p.checked_in_at ? <Text style={{ color: t.moss, fontWeight: "800" }}>In</Text>
              : <Pressable disabled={!d.enabled} onPress={() => void check({ user_id: p.user_id })} accessibilityRole="button" accessibilityLabel={`Check in ${p.name}`}
                style={{ borderWidth: 1.5, borderColor: t.ink, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: "center", opacity: d.enabled ? 1 : 0.4 }}>
                <Text style={{ color: t.ink, fontWeight: "700" }}>Check in</Text></Pressable>}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
