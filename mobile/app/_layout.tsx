import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { fontMap } from "../lib/fonts";
import { AuthProvider } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { appRoute } from "../lib/links";

// Keep the bulb splash up until the fonts are in, so the first screen never flashes in the system font.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Opens the right screen when someone taps a push, whether the app was open, in the background or closed. */
function OpenOnTap() {
  if (Platform.OS === "web") return null; // push taps do not exist in the browser preview
  return <OpenOnTapNative />;
}

function OpenOnTapNative() {
  const router = useRouter();
  const last = Notifications.useLastNotificationResponse();
  const seen = React.useRef<string | null>(null);
  useEffect(() => {
    if (!last) return;
    const id = last.notification.request.identifier;
    if (seen.current === id) return;
    seen.current = id;
    const link = (last.notification.request.content.data as { link?: string } | undefined)?.link;
    const to = appRoute(link);
    if (to) setTimeout(() => router.push(to as never), 0);
  }, [last, router]);
  return null;
}

export default function Root() {
  const t = useTheme();
  const [fontsReady, fontError] = useFonts(fontMap);
  useEffect(() => { if (fontsReady || fontError) void SplashScreen.hideAsync().catch(() => {}); }, [fontsReady, fontError]);
  if (!fontsReady && !fontError) return null; // a failed font load falls back to the system font
  return (
    <AuthProvider>
      <OpenOnTap />
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.ink, headerTitleStyle: { fontWeight: "700" }, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ title: "Profile" }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="challenge/[org]/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="apply/[org]/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="pitch/[team]" options={{ title: "Your pitch" }} />
        <Stack.Screen name="org/[org]" options={{ title: "" }} />
        <Stack.Screen name="results/[org]/[slug]" options={{ title: "Results" }} />
        <Stack.Screen name="join/[code]" options={{ title: "Team invite" }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </AuthProvider>
  );
}
