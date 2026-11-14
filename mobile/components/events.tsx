import React from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { EventCard } from "../lib/schemas";
import { daysLeft, eventWhen } from "../lib/format";
import { F, topicLabel } from "../lib/fonts";
import { FILL, shadow, useTheme } from "../lib/theme";
import { Banner, Scrim } from "./Banner";
import { DaysStamp, Pill } from "./ui";

/** The small ink label that marks a listing Kakushin does not run. */
export function ExternalTag() {
  return (
    <View style={{ backgroundColor: "#111111", paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ color: "#F6F4EE", fontSize: 10, fontFamily: F.monoMed, letterSpacing: 1.2 }}>EXTERNAL</Text>
    </View>
  );
}

/** A global event in a list: the same shape as a challenge tile, with the External label and where it is. */
export function EventTile({ e, i = 0, onOpen }: { e: EventCard; i?: number; onOpen: () => void }) {
  const t = useTheme();
  const d = daysLeft(e.deadline_at ?? e.starts_at);
  const where = e.is_online ? "Online" : e.location;
  const when = eventWhen(e);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${e.title}, an external event${e.organizer ? ` by ${e.organizer}` : ""}`} style={({ pressed }) => [{ gap: 12 }, pressed && { opacity: 0.9 }]}>
      <View style={[{ borderRadius: 20 }, shadow(0.3)]}>
        <Banner url={e.image_url} seed={e.slug} label={e.title} style={{ height: 190, borderRadius: 20 }}>
          <Scrim height={120} />
          <View style={{ position: "absolute", top: 14, left: 14 }}><ExternalTag /></View>
          {d !== null && d > 0 && d <= 99 ? <View style={{ position: "absolute", top: 14, right: 14 }}><DaysStamp days={d} fill={e.deadline_at ? FILL.red : FILL.indigo} tilt={[3, -2, 2][i % 3]!} /></View> : null}
          <View style={{ position: "absolute", left: 16, right: 16, bottom: 14, gap: 3 }}>
            <Text numberOfLines={1} style={{ color: "#fff", fontSize: 11, fontFamily: F.monoMed, letterSpacing: 1.4, textTransform: "uppercase" }}>{e.organizer || e.host}</Text>
            <Text numberOfLines={3} style={{ color: "#fff", fontFamily: F.display, fontSize: 24, lineHeight: 26 }}>{e.title}</Text>
          </View>
        </Banner>
      </View>
      {e.topics.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{e.topics.slice(0, 4).map((x) => <Pill key={x} text={topicLabel(x)} />)}</View> : null}
      <Text style={{ color: t.ink, fontSize: 13, fontFamily: F.mono, paddingHorizontal: 2 }}>{[where, when].filter(Boolean).join("  ·  ") || `On ${e.host}`}</Text>
    </Pressable>
  );
}

/** A round bookmark button that floats over a banner. Filled red when saved. */
export function SaveFab({ saved, onPress, top, right = 16 }: { saved: boolean; onPress: () => void; top: number; right?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: saved }} accessibilityLabel={saved ? "Saved. Tap to remove" : "Save for later"}
      style={[{ position: "absolute", top, right, width: 44, height: 44, borderRadius: 22, backgroundColor: saved ? FILL.red : "#F6F4EEEB", alignItems: "center", justifyContent: "center" }, shadow(0.3)]}>
      <Svg width={16} height={20} viewBox="0 0 16 20" fill={saved ? "#ffffff" : "none"} stroke={saved ? "#ffffff" : "#111111"} strokeWidth={2.4} strokeLinejoin="round"><Path d="M2 2h12v16l-6-4.5L2 18z" /></Svg>
    </Pressable>
  );
}
