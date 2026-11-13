import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const DAY = 86_400_000;
const TAG = "kakushin-reminder";

export interface ReminderTeam {
  id: string; name: string; status: string; title: string; cslug: string; oslug: string;
  cstatus?: string; applications_close_at?: number | null; pitch_due_at?: number | null; has_pitch?: boolean;
}

interface Planned { id: string; at: number; title: string; body: string; link: string }

/** The reminders a set of teams needs: 3 days and 1 day before applications close and before the pitch is due. */
export function planReminders(teams: ReminderTeam[], now = Date.now()): Planned[] {
  const out: Planned[] = [];
  const add = (key: string, due: number | null | undefined, title: (when: string) => string, body: string, link: string) => {
    if (!due || due <= now) return;
    for (const [lead, when] of [[3 * DAY, "in 3 days"], [DAY, "tomorrow"]] as const) {
      const at = due - lead;
      if (at > now + 60_000) out.push({ id: `${TAG}:${key}:${lead / DAY}:${at}`, at, title: title(when), body, link });
    }
  };
  for (const t of teams) {
    const link = `/o/${t.oslug}/c/${t.cslug}`;
    // Same rules as the server's inbox reminders: a team still forming before close, a shortlisted team with no pitch yet.
    if (t.status === "forming" && (t.cstatus ?? "open") === "open") {
      add(`${t.id}:close`, t.applications_close_at, (w) => `Applications close ${w}: ${t.title}`, `Your team ${t.name} has not applied yet. Your team lead sends the application.`, link);
    }
    if ((t.status === "shortlisted" || t.status === "finalist") && !t.has_pitch) {
      add(`${t.id}:pitch`, t.pitch_due_at, (w) => `Pitch due ${w}: ${t.title}`, `Team ${t.name} has not sent its pitch yet. Upload your deck before the deadline.`, link);
    }
  }
  return out;
}

// The server already pushes its own deadline reminders. When those reach this phone, scheduling ours too would
// double every reminder, so the phone only keeps its own when server pushes are off or this phone cannot get them.
let serverPushes = false;
export const setServerPushes = (on: boolean) => { serverPushes = on; };

/**
 * Replaces this phone's scheduled deadline reminders with the ones the teams need now. They fire even with no signal.
 * Needs notification permission, which the app already asks for when someone signs in; without it this does nothing.
 */
export async function syncReminders(teams: ReminderTeam[]): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if ((await Notifications.getPermissionsAsync()).status !== "granted") return;
    const want = serverPushes ? [] : planReminders(teams);
    const have = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(TAG));
    const wantIds = new Set(want.map((w) => w.id));
    for (const n of have) if (!wantIds.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    const haveIds = new Set(have.map((n) => n.identifier));
    for (const w of want) {
      if (haveIds.has(w.id)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: w.id,
        content: { title: w.title, body: w.body, data: { link: w.link } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(w.at) },
      });
    }
  } catch { /* reminders are a nicety; the inbox still gets the server's ones */ }
}

/** Signing out removes the last person's reminders from the phone. */
export async function clearReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
      if (n.identifier.startsWith(TAG)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  } catch { /* nothing scheduled */ }
}
