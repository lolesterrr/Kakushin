import React, { useState } from "react";
import { Linking, Pressable, Share, Platform, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { API_URL } from "../../lib/config";
import { toSignIn } from "../../lib/nav";
import { eventDetail } from "../../lib/schemas";
import { daysLeft, fmtDate } from "../../lib/format";
import { addToCalendar, setSaved } from "../../lib/saved";
import { F, topicLabel } from "../../lib/fonts";
import { useLoad } from "../../lib/useLoad";
import { FILL, shadow, useTheme } from "../../lib/theme";
import { Banner, Scrim } from "../../components/Banner";
import { ExternalTag, SaveFab } from "../../components/events";
import { Body, Button, Card, DaysStamp, H2, Label, Loading, Notice, Offline, Pill, Screen } from "../../components/ui";

/** One global event: what it is, when, where, and the way out to its official page. Kakushin does not run it. */
export default function EventScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const here = `/event/${slug}`;
  const ev = useLoad(() => api(`/events/${slug}`, { schema: eventDetail }), [slug, me?.id], { cache: `event.${slug}` });
  const [mine, setMine] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");

  const e = ev.data?.event;
  if (!e) return <Screen><Stack.Screen options={{ headerShown: true, title: "" }} />{ev.err ? <Notice kind="err">{ev.err === "Not found" ? "We could not find that event. It may have been taken off the list." : ev.err}</Notice> : <Loading />}</Screen>;
  const saved = mine ?? ev.data!.saved;
  const listed = e.state === "published";
  const d = daysLeft(e.deadline_at ?? e.starts_at);
  const hasDates = !!(e.deadline_at || e.starts_at);

  async function toggleSave() {
    if (!me) { toSignIn(router, here); return; }
    const next = !saved;
    setMine(next); setMsg("");
    try { await setSaved(`events/${slug}`, next); } catch (err) { setMine(!next); setMsg((err as Error).message); }
  }
  // The official page opens inside the app's browser sheet, so the person lands back here when they close it.
  const openSite = () => void WebBrowser.openBrowserAsync(e.url).catch(() => Linking.openURL(e.url).catch(() => setMsg("Could not open the page.")));
  const share = () => {
    const url = `${API_URL}/events/${e.slug}`;
    const message = `${e.title}${e.deadline_at ? ` (apply by ${fmtDate(e.deadline_at)})` : ""}: ${url}`;
    void Share.share(Platform.OS === "ios" ? { message, url } : { message, title: e.title }).catch(() => {});
  };
  const fact = (label: string, value: string, dark = false) => (
    <View style={{ flex: 1, minWidth: 110, backgroundColor: dark ? "#111111" : t.card, borderWidth: dark ? 0 : 1.5, borderColor: t.ink, borderRadius: 14, padding: 12 }}>
      <Label>{label}</Label><Text style={{ color: dark ? "#F6F4EE" : t.ink, fontFamily: F.display, fontSize: 18, lineHeight: 22 }}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen onRefresh={ev.refresh} refreshing={ev.refreshing} flush>
        <Stack.Screen options={{ headerShown: false }} />
        <Banner url={e.image_url} seed={e.slug} label={e.title} style={{ height: 280 }}><Scrim height={90} /></Banner>
        <View style={{ marginTop: -26, backgroundColor: t.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ExternalTag />
            <Text numberOfLines={1} style={{ flex: 1, color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" }}>{e.organizer || e.host}</Text>
          </View>
          {ev.stale ? <Offline /> : null}
          <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 30, lineHeight: 33, letterSpacing: -0.6 }}>{e.title}</Text>
          {e.summary ? <Body muted>{e.summary}</Body> : null}
          {e.topics.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{e.topics.map((x) => <Pill key={x} text={topicLabel(x)} />)}</View> : null}
          {!listed ? <Notice kind="err">{e.state === "pending" ? "This event is waiting for review. Only you and the Kakushin team can see it." : "This event is not on the public list."}</Notice> : null}
          {e.over ? <Notice kind="err">This event has passed. Check its official page for the next round.</Notice> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {e.deadline_at ? fact("Apply by", fmtDate(e.deadline_at)) : null}
            {e.starts_at ? fact(e.ends_at ? "Starts" : "Date", fmtDate(e.starts_at)) : null}
            {e.ends_at ? fact("Ends", fmtDate(e.ends_at)) : null}
            {e.is_online || e.location ? fact("Where", e.is_online ? "Online" : e.location, true) : null}
          </View>
          {d !== null && d > 0 && d <= 99 ? <View style={{ flexDirection: "row" }}><DaysStamp days={d} tilt={-2} fill={e.deadline_at ? FILL.red : FILL.indigo} /></View> : null}

          <Button title="Open the official page" onPress={openSite} />
          {listed && hasDates && !e.over ? <Button title="Add to my calendar" kind="ghost" onPress={() => void addToCalendar(`events/${e.slug}`).catch(() => setMsg("Could not open the calendar."))} /> : null}
          {listed ? <Button title={saved ? "Saved. Tap to remove" : "Save for later"} kind="ghost" onPress={() => void toggleSave()} /> : null}
          {listed ? <Button title="Share" kind="ghost" onPress={share} /> : null}
          {saved && hasDates && !e.over ? <Body muted style={{ fontSize: 13 }}>You get a reminder three days and one day before it {e.deadline_at ? "closes" : "starts"}.</Body> : null}
          {msg ? <Notice kind="err">{msg}</Notice> : null}

          <Card>
            <Label>Not run on Kakushin</Label>
            <Body muted>{e.source === "Suggested by the community" ? "Suggested by someone on Kakushin and checked by our team. " : e.source ? `Listed from ${e.source}. ` : ""}Applications, rules and prizes are handled by its organisers on {e.host}, so check the details there before you apply.</Body>
          </Card>
          {e.description ? <><H2>About</H2><Body>{e.description}</Body></> : null}
          {listed ? (
            <Text accessibilityRole="button" onPress={() => (me ? router.push({ pathname: "/report", params: { kind: "event", slug: e.slug, title: e.title } } as never) : toSignIn(router, here))}
              style={{ color: t.muted, fontSize: 14, textDecorationLine: "underline", paddingVertical: 10 }}>Something wrong? Report this listing</Text>
          ) : null}
        </View>
      </Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"
        style={[{ position: "absolute", top: insets.top + 8, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: "#F6F4EEEB", alignItems: "center", justifyContent: "center" }, shadow(0.3)]}>
        <Svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="#111111" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><Path d="M11 3L5 9l6 6" /></Svg>
      </Pressable>
      {listed ? <SaveFab saved={saved} onPress={() => void toggleSave()} top={insets.top + 8} /> : null}
    </View>
  );
}
