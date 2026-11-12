import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "./api";

let registered: string | null = null;

// Show a banner while the app is open too, so a push never seems to vanish.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export type PushState = "ready" | "denied" | "unsupported";

/**
 * Asks for permission (once), gets this phone's Expo push token and tells the server about it.
 * Returns why it could not, so the Profile screen can explain instead of failing quietly.
 */
export async function registerForPush(): Promise<PushState> {
  if (Platform.OS === "web" || !Device.isDevice) return "unsupported";
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Kakushin", importance: Notifications.AndroidImportance.DEFAULT });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return "denied";
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tok = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api("/inbox/push-token", { method: "POST", json: { token: tok.data, platform: Platform.OS === "android" ? "android" : "ios" } });
    registered = tok.data;
    return "ready";
  } catch {
    return "unsupported";
  }
}

/** Forget this phone on the server so the next person to sign in here does not get the last person's notes. */
export async function unregisterPush(): Promise<void> {
  if (!registered) return;
  const token = registered;
  registered = null;
  try { await api("/inbox/push-token", { method: "DELETE", json: { token } }); } catch { /* the server also drops dead tokens */ }
}
