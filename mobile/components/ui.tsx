import React from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { FILL, shadow, useTheme } from "../lib/theme";
import { F } from "../lib/fonts";

export function Screen({ children, scroll = true, onRefresh, refreshing = false, flush = false }: { children: React.ReactNode; scroll?: boolean; onRefresh?: () => void; refreshing?: boolean; flush?: boolean }) {
  const t = useTheme();
  if (!scroll) return <View style={{ flex: 1, backgroundColor: t.bg }}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={flush ? { paddingBottom: 130 } : { padding: 16, paddingBottom: 120, gap: 12 }} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export const H1 = ({ children }: { children: React.ReactNode }) => { const t = useTheme(); return <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 36, fontFamily: F.display, color: t.ink, letterSpacing: -0.6 }}>{children}</Text>; };
export const H2 = ({ children }: { children: React.ReactNode }) => { const t = useTheme(); return <Text accessibilityRole="header" style={{ fontSize: 22, lineHeight: 26, fontFamily: F.display, color: t.ink, marginTop: 10, letterSpacing: -0.3 }}>{children}</Text>; };
export const Body = ({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) => { const t = useTheme(); return <Text style={[{ fontSize: 16, lineHeight: 23, color: muted ? t.muted : t.ink }, style]}>{children}</Text>; };
/** A ledger column head: small mono capitals. */
export const Label = ({ children }: { children: React.ReactNode }) => { const t = useTheme(); return <Text style={{ fontSize: 11, fontFamily: F.monoMed, letterSpacing: 1.6, textTransform: "uppercase", color: t.muted, marginTop: 4 }}>{children}</Text>; };

export function Button({ title, onPress, kind = "primary", disabled, busy }: { title: string; onPress: () => void; kind?: "primary" | "ghost"; disabled?: boolean; busy?: boolean }) {
  const t = useTheme();
  const off = disabled || busy;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off }} onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, kind === "primary" ? [{ backgroundColor: FILL.red }, shadow(0.3)] : { borderWidth: 1.5, borderColor: t.ink }, off && { opacity: 0.5 }, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
      {busy ? <ActivityIndicator color={kind === "primary" ? "#fff" : t.ink} /> : <Text style={{ color: kind === "primary" ? "#fff" : t.ink, fontSize: 16, fontWeight: "700" }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...rest }: TextInputProps & { label: string }) {
  const t = useTheme();
  const [focus, setFocus] = React.useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontFamily: F.monoMed, letterSpacing: 1.6, textTransform: "uppercase", color: t.ink }}>{label}</Text>
      {/* A ruled box with a red margin line, typed in mono, like the website's forms. */}
      <TextInput accessibilityLabel={label} placeholderTextColor={t.muted} {...rest} onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        style={[{ borderWidth: 1.5, borderColor: t.ink, borderLeftWidth: focus ? 7 : 4, borderLeftColor: t.red, backgroundColor: rest.editable === false ? t.sand : t.ledger, color: t.ink, borderRadius: 0, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, fontFamily: F.mono, minHeight: 52 }, rest.multiline && { minHeight: 112, textAlignVertical: "top" }]} />
    </View>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "err"; children: React.ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole={kind === "err" ? "alert" : undefined} style={{ color: kind === "ok" ? t.moss : t.redText, fontSize: 15, fontWeight: "600" }}>{children}</Text>;
}

export function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: ViewStyle }) {
  const t = useTheme();
  const base = [{ backgroundColor: t.card, borderWidth: 1.5, borderColor: t.ink, borderRadius: 18, padding: 16, gap: 6 }, style];
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...base, pressed && { opacity: 0.85 }]}>{children}</Pressable> : <View style={base}>{children}</View>;
}

/** A chip: mono capitals ruled in ink. The chosen one fills with ink and gets the red dot, like the website. */
export function Pill({ text, on, onPress }: { text: string; on?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const small = !onPress;
  const style = { flexDirection: "row" as const, alignItems: "center" as const, gap: 7, paddingHorizontal: small ? 11 : 15, minHeight: small ? 28 : 40, borderRadius: 999,
    borderWidth: small ? 1 : 1.5, borderColor: t.ink, backgroundColor: on ? t.ink : "transparent" };
  const label = <>
    {on ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: FILL.red }} /> : null}
    <Text style={{ fontSize: small ? 11 : 12, fontFamily: F.monoMed, letterSpacing: 0.8, textTransform: "uppercase", color: on ? t.bg : t.ink }}>{text}</Text>
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={({ pressed }) => [style, pressed && !on && { borderColor: FILL.red }]}>{label}</Pressable> : <View style={style}>{label}</View>;
}

/** Numbered folder tabs ("01 About you"), for screens with sections. Scrolls sideways on narrow phones. */
export function Folders({ tabs, value, onChange }: { tabs: string[]; value: number; onChange: (i: number) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={{ flexGrow: 0, borderBottomWidth: 1.5, borderBottomColor: t.ink }} contentContainerStyle={{ gap: 4, paddingHorizontal: 16, alignItems: "flex-end" }}>
      {tabs.map((label, i) => {
        const on = value === i;
        return (
          <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(i)}
            style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 14, paddingVertical: on ? 12 : 9, borderWidth: 1.5, borderBottomWidth: 0, borderColor: t.ink, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: on ? t.ink : t.bg }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: on ? FILL.red : t.muted }}>{String(i + 1).padStart(2, "0")}</Text>
            <Text style={{ fontFamily: F.monoMed, fontSize: 12, color: on ? t.bg : t.ink }}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const STAMP: Record<string, { big: string; small: string; fill: string }> = {
  forming: { big: "Team", small: "FORMING", fill: FILL.gold }, applied: { big: "Sent", small: "UNDER REVIEW", fill: FILL.indigo },
  shortlisted: { big: "Yes!", small: "SHORTLISTED", fill: FILL.moss }, rejected: { big: "Thanks", small: "NOT SELECTED", fill: FILL.ink },
  finalist: { big: "Final", small: "FINALIST", fill: FILL.gold }, winner: { big: "Won", small: "WINNER", fill: FILL.red },
};
/** The status stamp from the poster design: a solid fill with a dashed edge. */
export function StatusStamp({ status }: { status: string }) {
  const x = STAMP[status] ?? STAMP.forming!;
  return (
    <View accessible accessibilityLabel={x.small.toLowerCase()} style={{ backgroundColor: x.fill, borderWidth: 2, borderStyle: "dashed", borderColor: "#ffffffaa", paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", minWidth: 84 }}>
      <Text style={{ color: "#fff", fontSize: 22, fontFamily: F.display }}>{x.big}</Text>
      <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>{x.small}</Text>
    </View>
  );
}

export const Loading = () => <View style={{ padding: 32 }}><ActivityIndicator /></View>;
const s = StyleSheet.create({ btn: { minHeight: 52, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 } });

/** Handwritten accent line, used sparingly for warmth. */
export const Hand = ({ children, size = 26 }: { children: React.ReactNode; size?: number }) => { const t = useTheme(); return <Text style={{ fontFamily: F.hand, fontSize: size, lineHeight: size + 2, color: t.redText }}>{children}</Text>; };

/** Days-left stamp: a solid fill with a dashed edge, tilted a little. */
export function DaysStamp({ days, fill = FILL.red, tilt = 3 }: { days: number; fill?: string; tilt?: number }) {
  return (
    <View accessible accessibilityLabel={`${days} ${days === 1 ? "day" : "days"} left`} style={{ backgroundColor: fill, borderWidth: 2, borderStyle: "dashed", borderColor: "#ffffffcc", paddingHorizontal: 12, paddingVertical: 7, alignItems: "center", transform: [{ rotate: `${tilt}deg` }] }}>
      <Text style={{ color: "#fff", fontSize: 24, lineHeight: 26, fontFamily: F.display }}>{days}</Text>
      <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>{days === 1 ? "DAY LEFT" : "DAYS LEFT"}</Text>
    </View>
  );
}

/** Shown when a screen is on its saved copy because the network failed. */
export function Offline() {
  const t = useTheme();
  return <Text accessibilityRole="alert" style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>No connection. Showing what was saved; pull down to try again.</Text>;
}

/** A card for screens that need an account, so signed-out visitors see why instead of a dead end. */
export function SignInCard({ title, body, onSignIn }: { title: string; body: string; onSignIn: () => void }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, padding: 20, gap: 10 }, shadow(0.08)]}>
      <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 22, lineHeight: 26 }}>{title}</Text>
      <Text style={{ color: t.muted, fontSize: 16, lineHeight: 23 }}>{body}</Text>
      <Button title="Sign in or create an account" onPress={onSignIn} />
    </View>
  );
}
