import React from "react";
import { Image, Linking, Text, View } from "react-native";
import { parseMarkdown, type Inline } from "../lib/markdown";
import { API_URL } from "../lib/config";
import { useTheme } from "../lib/theme";
import { F } from "../lib/fonts";

/** Organiser text with basic formatting: headings, lists, bold, italic and links. Same reader as the web (lib/markdown.ts). */
export function Markdown({ text }: { text: string }) {
  const t = useTheme();
  const base = { fontSize: 16, lineHeight: 23, color: t.ink };
  const inl = (nodes: Inline[], key = "i"): React.ReactNode[] => nodes.map((n, i) => {
    const k = `${key}${i}`;
    switch (n.t) {
      case "text": return n.v;
      case "code": return <Text key={k} style={{ fontFamily: "Courier" }}>{n.v}</Text>;
      case "b": return <Text key={k} style={{ fontWeight: "700" }}>{inl(n.c, k)}</Text>;
      case "i": return <Text key={k} style={{ fontStyle: "italic" }}>{inl(n.c, k)}</Text>;
      case "a": return <Text key={k} accessibilityRole="link" onPress={() => void Linking.openURL(n.href)} style={{ color: t.redText, textDecorationLine: "underline" }}>{inl(n.c, k)}</Text>;
      case "img": return null; // drawn as its own block below
    }
  });
  const images = (nodes: Inline[]) => nodes.filter((n): n is Extract<Inline, { t: "img" }> => n.t === "img");
  return (
    <View style={{ gap: 10 }}>
      {parseMarkdown(text).map((b, i) => {
        if (b.t === "h") return <Text key={i} accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: b.level === 1 ? 22 : b.level === 2 ? 19 : 17, marginTop: 4 }}>{inl(b.c)}</Text>;
        if (b.t === "hr") return <View key={i} style={{ height: 1, backgroundColor: t.line }} />;
        if (b.t === "ul" || b.t === "ol") {
          return (
            <View key={i} style={{ gap: 4 }}>
              {b.items.map((it, j) => (
                <View key={j} style={{ flexDirection: "row", gap: 8 }}>
                  <Text style={base}>{b.t === "ol" ? `${b.start + j}.` : "•"}</Text>
                  <Text style={[base, { flex: 1 }]}>{inl(it)}</Text>
                </View>
              ))}
            </View>
          );
        }
        const pics = images(b.c);
        return (
          <View key={i} style={{ gap: 8 }}>
            {b.c.some((n) => n.t !== "img" && !(n.t === "text" && !n.v.trim())) ? <Text style={[base, b.t === "quote" ? { color: t.muted, fontStyle: "italic" } : null]}>{inl(b.c)}</Text> : null}
            {pics.map((p, j) => <Image key={j} accessibilityLabel={p.alt} source={{ uri: `${API_URL}${p.src}` }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }} resizeMode="cover" />)}
          </View>
        );
      })}
    </View>
  );
}
