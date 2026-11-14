import React from "react";
import { Tabs } from "expo-router";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { TabBar } from "../../components/TabBar";

export default function TabsLayout() {
  const { ready } = useAuth();
  const t = useTheme();
  if (!ready) return null;
  // Explore and challenges are open to everyone; My teams and Inbox ask for sign-in on their own screens.
  return (
    <Tabs tabBar={(p) => <TabBar {...(p as unknown as React.ComponentProps<typeof TabBar>)} />}
      screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerShadowVisible: false, headerTintColor: t.ink, headerTitleStyle: { fontWeight: "800" } }}>
      <Tabs.Screen name="index" options={{ title: "Explore", headerShown: false }} />
      <Tabs.Screen name="global" options={{ title: "Global events", headerShown: false }} />
      <Tabs.Screen name="teams" options={{ title: "My teams" }} />
      <Tabs.Screen name="judge" options={{ title: "Judging" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
    </Tabs>
  );
}
