import React, { useState } from "react";
import { Image, Linking, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";
import { API_URL } from "../lib/config";
import { F } from "../lib/fonts";
import { abs } from "../lib/media";
import { FILL, useTheme } from "../lib/theme";

/** A person's picture in a ruled circle, or their first letter when they have none. */
export function Avatar({ name, url, size = 40, ring }: { name: string; url?: string | null; size?: number; ring?: string }) {
  const t = useTheme();
  const [broken, setBroken] = useState(false);
  const src = abs(url);
  const box = { width: size, height: size, borderRadius: size / 2, borderWidth: size > 60 ? 3 : 1.5, borderColor: ring ?? t.ink };
  if (src && !broken) return <Image source={{ uri: src }} onError={() => setBroken(true)} accessibilityIgnoresInvertColors style={[box, { backgroundColor: t.sand }]} />;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={[box, { backgroundColor: t.sand, alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ color: t.ink, fontFamily: F.display, fontSize: size * 0.42 }}>{(name.trim()[0] ?? "?").toUpperCase()}</Text>
    </View>
  );
}

/**
 * A YouTube video played inside the app, or a plain link for any other address. Nothing when there is no link.
 * The player sits in a small page served from Kakushin's address, because YouTube refuses embeds with no referrer.
 */
export function Video({ embed, url, title }: { embed?: string | null; url?: string | null; title: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  if (embed && Platform.OS !== "web") {
    const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;height:100%}iframe{border:0;width:100%;height:100%}</style>
<iframe src="${embed}?playsinline=1&rel=0" title="${title.replace(/"/g, "")}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    const h = Math.round((Math.min(width, 640) - 32) * 9 / 16);
    return (
      <View style={{ height: h, borderRadius: 14, overflow: "hidden", borderWidth: 1.5, borderColor: t.ink, backgroundColor: "#000" }}>
        <WebView source={{ html, baseUrl: API_URL }} allowsInlineMediaPlayback allowsFullscreenVideo mediaPlaybackRequiresUserAction javaScriptEnabled originWhitelist={["*"]} style={{ flex: 1, backgroundColor: "#000" }} />
      </View>
    );
  }
  const link = url || (embed ? embed.replace("youtube-nocookie.com/embed/", "youtube.com/watch?v=") : null);
  if (!link) return null;
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(link)} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderWidth: 1.5, borderColor: t.ink, borderRadius: 14 }}>
      <View style={{ width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderLeftWidth: 12, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: FILL.red }} />
      <Text style={{ color: t.ink, fontFamily: F.monoMed, fontSize: 13, flex: 1 }} numberOfLines={1}>Watch the video</Text>
    </Pressable>
  );
}

export type MediaImage = { id: string; url: string; caption: string };

/** Screenshots: one big picture with its caption, and numbered thumbnails to switch. Nothing when there are none. */
export function ImageStrip({ images, title }: { images: MediaImage[]; title: string }) {
  const t = useTheme();
  const [i, setI] = useState(0);
  if (!images.length) return null;
  const cur = images[Math.min(i, images.length - 1)]!;
  return (
    <View style={{ gap: 8 }}>
      <Image source={{ uri: abs(cur.url)! }} accessibilityLabel={cur.caption || `${title} screenshot ${i + 1}`} resizeMode="contain"
        style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 14, borderWidth: 1.5, borderColor: t.ink, backgroundColor: t.sand }} />
      {cur.caption ? <Text style={{ color: t.muted, fontFamily: F.hand, fontSize: 19 }}>{cur.caption}</Text> : null}
      {images.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {images.map((m, n) => (
            <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Show screenshot ${n + 1}`} accessibilityState={{ selected: n === i }} onPress={() => setI(n)}>
              <Image source={{ uri: abs(m.url)! }} style={{ width: 72, height: 54, borderRadius: 8, borderWidth: n === i ? 2.5 : 1, borderColor: n === i ? FILL.red : t.ink, backgroundColor: t.sand }} />
              <Text style={{ position: "absolute", left: 4, top: 2, color: "#fff", fontFamily: F.monoMed, fontSize: 10, textShadowColor: "#000", textShadowRadius: 3 }}>{String(n + 1).padStart(2, "0")}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Striped stand-in for a project with no pictures, so a card never has a hole. */
export function NoCover({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12, borderWidth: 1.5, borderColor: t.ink, backgroundColor: t.sand, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {Array.from({ length: 14 }).map((_, n) => <View key={n} style={{ position: "absolute", left: n * 34 - 120, top: -40, width: 12, height: 400, backgroundColor: t.line, transform: [{ rotate: "35deg" }] }} />)}
      <Text style={{ color: t.muted, fontFamily: F.monoMed, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}
