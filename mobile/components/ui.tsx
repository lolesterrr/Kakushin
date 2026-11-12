import React from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { FILL, useTheme } from "../lib/theme";

export function Screen({ children, scroll = true, onRefresh, refreshing = false }: { children: React.ReactNode; scroll?: boolean; onRefresh?: () => void; refreshing?: boolean }) {
  const t = useTheme();
  if (!scroll) return <View style={{ flex: 1, backgroundColor: t.bg }}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export const H1 = ({ children }: { children: React.ReactNode }) => { const t = useTheme(); return <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: "800", color: t.ink, letterSpacing: -0.5 }}>{children}</Text>; };
export const H2 = ({ children }: { children: React.ReactNode }) => { const t = useTheme(); return <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: "700", color: t.ink, marginTop: 8 }}>{children}</Text>; };
export const Body = ({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) => { const t = useTheme(); return <Text style={[{ fontSize: 16, lineHeight: 23, color: muted ? t.muted : t.ink }, style]}>{children}</Text>; };
export const Label = ({ children }: { children: React.ReactNode }) => { const t = useTheme(); return <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: t.muted, marginTop: 4 }}>{children}</Text>; };

export function Button({ title, onPress, kind = "primary", disabled, busy }: { title: string; onPress: () => void; kind?: "primary" | "ghost"; disabled?: boolean; busy?: boolean }) {
  const t = useTheme();
  const off = disabled || busy;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off }} onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, kind === "primary" ? { backgroundColor: FILL.red } : { borderWidth: 1.5, borderColor: t.ink }, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}>
      {busy ? <ActivityIndicator color={kind === "primary" ? "#fff" : t.ink} /> : <Text style={{ color: kind === "primary" ? "#fff" : t.ink, fontSize: 16, fontWeight: "700" }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...rest }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput accessibilityLabel={label} placeholderTextColor={t.muted} {...rest}
        style={[{ borderWidth: 1, borderColor: t.line, backgroundColor: t.sand, color: t.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 }, rest.multiline && { minHeight: 96, textAlignVertical: "top" }]} />
    </View>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "err"; children: React.ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole={kind === "err" ? "alert" : undefined} style={{ color: kind === "ok" ? t.moss : t.redText, fontSize: 15, fontWeight: "600" }}>{children}</Text>;
}

export function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: ViewStyle }) {
  const t = useTheme();
  const base = [{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 16, gap: 6 }, style];
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...base, pressed && { opacity: 0.85 }]}>{children}</Pressable> : <View style={base}>{children}</View>;
}

export function Pill({ text, on, onPress }: { text: string; on?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const style = { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? t.ink : t.line, backgroundColor: on ? t.ink : t.sand };
  const label = <Text style={{ fontSize: 13, color: on ? t.bg : t.ink }}>{text}</Text>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={style}>{label}</Pressable> : <View style={style}>{label}</View>;
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
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>{x.big}</Text>
      <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>{x.small}</Text>
    </View>
  );
}

export const Loading = () => <View style={{ padding: 32 }}><ActivityIndicator /></View>;
const s = StyleSheet.create({ btn: { minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 } });
