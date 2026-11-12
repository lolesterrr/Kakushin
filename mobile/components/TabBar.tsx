import React from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../lib/api";
import { inbox } from "../lib/schemas";
import { shadow } from "../lib/theme";

type Props = { state: { index: number; routes: { key: string; name: string }[] }; emitter: { emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } }; navigateToTab: (routeKey: string) => void };

const TABS = [
  { name: "index", label: "Explore" },
  { name: "teams", label: "My teams" },
  { name: "inbox", label: "Inbox" },
] as const;

function Glyph({ name, color }: { name: string; color: string }) {
  if (name === "index") return <Svg width={22} height={22} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round"><Circle cx={9} cy={9} r={6} /><Path d="M14 14l4 4" /></Svg>;
  if (name === "teams") return <Svg width={24} height={22} viewBox="0 0 22 20" fill={color}><Circle cx={7} cy={6} r={4} /><Circle cx={16} cy={7} r={3} /><Path d="M0 19c0-4 3-7 7-7s7 3 7 7z" /><Path d="M15 12c3.5 0 6 2.6 6 6v1h-5c0-2.7-.8-5-2.3-6.6.4-.3.8-.4 1.3-.4z" /></Svg>;
  return <Svg width={24} height={20} viewBox="0 0 22 18" fill={color}><Path d="M1 0h20a1 1 0 011 1v1.5l-11 7-11-7V1a1 1 0 011-1z" /><Path d="M0 5l11 7 11-7v12a1 1 0 01-1 1H1a1 1 0 01-1-1z" /></Svg>;
}

/** Floating dark bar: the open tab is a red tile with its name, the others are solid glyphs. Profile lives behind the avatar. */
export function TabBar({ state, emitter, navigateToTab }: Props) {
  const insets = useSafeAreaInsets();
  const [unread, setUnread] = React.useState(0);
  const current = state.routes[state.index]?.name;
  React.useEffect(() => {
    let alive = true;
    api("/inbox", { schema: inbox }).then((r) => { if (alive) setUnread(current === "inbox" ? 0 : r.unread); }).catch(() => {});
    return () => { alive = false; };
  }, [current]);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 20, right: 20, bottom: Math.max(insets.bottom, 12) + 4 }}>
      <View style={[{ height: 68, borderRadius: 24, backgroundColor: "#111111", flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 6 }, shadow(0.4)]}>
        {TABS.map((t) => {
          const route = state.routes.find((r) => r.name === t.name);
          if (!route) return null;
          const on = current === t.name;
          const press = () => { const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true }); if (!on && !e.defaultPrevented) navigateToTab(route.key); };
          return (
            <Pressable key={t.name} onPress={press} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.name === "inbox" && unread ? `Inbox, ${unread} unread` : t.label}
              style={{ flex: on ? 2 : 1, height: 48, borderRadius: 16, backgroundColor: on ? "#C8321F" : "transparent", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Glyph name={t.name} color={on ? "#ffffff" : "#BEB8AD"} />
              {on ? <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}>{t.label}</Text> : null}
              {t.name === "inbox" && unread > 0 && !on ? <View style={{ position: "absolute", top: 4, right: 14, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#D93A2B", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{unread}</Text></View> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
