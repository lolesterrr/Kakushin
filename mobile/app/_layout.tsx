import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../lib/auth";
import { useTheme } from "../lib/theme";

export default function Root() {
  const t = useTheme();
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.ink, headerTitleStyle: { fontWeight: "700" }, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="challenge/[org]/[slug]" options={{ title: "Challenge" }} />
      </Stack>
    </AuthProvider>
  );
}
