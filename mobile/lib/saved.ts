import { Linking } from "react-native";
import { api } from "./api";
import { API_URL } from "./config";

/** Bookmarks. `path` is "events/<slug>" or "challenges/<org>/<slug>". */
export const setSaved = (path: string, on: boolean) => api(`/saved/${path}`, { method: on ? "PUT" : "DELETE" });

/**
 * Hands the phone a calendar file for a challenge or a global event. The phone's own calendar app offers to add the
 * dates, with a reminder the day before, so the app needs no calendar permission of its own.
 */
export const addToCalendar = (path: string) => Linking.openURL(`${API_URL}/api/${path}/calendar.ics`);
