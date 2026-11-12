import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { appRoute } from "../lib/links";

/** Opens the right screen when someone taps a push, whether the app was open, in the background or closed. */
function OpenOnTap() {
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
  return (
    <AuthProvider>
      <OpenOnTap />
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.ink, headerTitleStyle: { fontWeight: "700" }, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="challenge/[org]/[slug]" options={{ title: "Challenge" }} />
      </Stack>
    </AuthProvider>
  );
}
