import { Linking, Platform, Share } from "react-native";
import { API_URL } from "./config";

/** The invite link opens the app where it is installed (kakushin://join/CODE), or the web join page anywhere else. */
export const inviteUrl = (code: string) => `${API_URL}/join/${code}`;

/** Opens the phone's share sheet with the team invite: a link plus the code, for people who type it in. */
export async function shareInvite(team: { name: string; invite_code: string }, challenge: string): Promise<void> {
  const url = inviteUrl(team.invite_code);
  const message = `Join my team "${team.name}" for ${challenge} on Kakushin: ${url}\n\nOr open the challenge in the app and enter the code ${team.invite_code}.`;
  // iOS shows the link as a preview card when it comes as `url`; Android only reads `message`.
  await Share.share(Platform.OS === "ios" ? { message, url } : { message, title: `Join ${team.name}` }).catch(() => {});
}

export const verifyUrl = (code: string) => `${API_URL}/verify/${code}`;

export async function shareCertificate(c: { code: string; title: string; challenge: string; org: string }): Promise<void> {
  const url = verifyUrl(c.code);
  const message = `I earned "${c.title}" in ${c.challenge} by ${c.org} on Kakushin. Check it here: ${url}`;
  await Share.share(Platform.OS === "ios" ? { message, url } : { message, title: c.title }).catch(() => {});
}

/** LinkedIn's "Add licence or certification" form, filled in. The person still confirms on LinkedIn. */
export function addToLinkedIn(c: { code: string; title: string; challenge: string; org: string; issued_at: number }): void {
  const d = new Date(c.issued_at);
  const q = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: `${c.title}: ${c.challenge}`,
    organizationName: c.org,
    issueYear: String(d.getFullYear()),
    issueMonth: String(d.getMonth() + 1),
    certUrl: verifyUrl(c.code),
    certId: c.code,
  });
  void Linking.openURL(`https://www.linkedin.com/profile/add?${q.toString()}`);
}
