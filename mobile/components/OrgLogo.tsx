import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { API_URL } from "../lib/config";
import { F } from "../lib/fonts";
import { useTheme } from "../lib/theme";

/** The organisation's logo, or its initials on ink when it has none. */
export function OrgLogo({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  const t = useTheme();
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  if (url && !broken) {
    const src = url.startsWith("http") ? url : `${API_URL}${url}`;
    return <Image source={{ uri: src }} onError={() => setBroken(true)} accessibilityLabel={`${name} logo`} style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }} />;
  }
  return (
    <View accessibilityLabel={`${name} logo`} style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: t.ink, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: t.bg, fontFamily: F.display, fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}
