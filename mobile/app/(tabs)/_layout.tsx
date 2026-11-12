import React from "react";
import { Redirect, Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const { ready, me } = useAuth();
  const t = useTheme();
  if (!ready) return null;
  if (!me) return <Redirect href="/sign-in" />;
  return (
    <Tabs screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.ink, headerTitleStyle: { fontWeight: "800" }, tabBarActiveTintColor: t.redText, tabBarInactiveTintColor: t.muted, tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.line } }}>
      <Tabs.Screen name="index" options={{ title: "Explore", tabBarIcon: icon("◎") }} />
      <Tabs.Screen name="teams" options={{ title: "My teams", tabBarIcon: icon("▣") }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: icon("✉") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("●") }} />
    </Tabs>
  );
}
