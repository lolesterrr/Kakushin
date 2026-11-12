import React from "react";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { TabBar } from "../../components/TabBar";

export default function TabsLayout() {
  const { ready, me } = useAuth();
  const t = useTheme();
  if (!ready) return null;
  if (!me) return <Redirect href="/sign-in" />;
  return (
    <Tabs tabBar={(p) => <TabBar {...(p as unknown as React.ComponentProps<typeof TabBar>)} />}
      screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerShadowVisible: false, headerTintColor: t.ink, headerTitleStyle: { fontWeight: "800" } }}>
      <Tabs.Screen name="index" options={{ title: "Explore", headerShown: false }} />
      <Tabs.Screen name="teams" options={{ title: "My teams" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
    </Tabs>
  );
}
