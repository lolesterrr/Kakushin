# Kakushin mobile app

Expo SDK 58 with Expo Router. It talks to the deployed Worker (the `API_URL` in `lib/config.ts`, or `EXPO_PUBLIC_API_URL` if set), so the phone does not need to be on the same network as your laptop.

## Run it on your iPhone

1. Install **Expo Go** from the App Store.
2. In this folder run `npm install`, then `npx expo start`.
3. Scan the QR code with the iPhone camera. Your laptop and phone must be on the same Wi-Fi for this step only. If that does not work, run `npx expo start --tunnel`.
4. Sign in with the email you use for Resend (until a domain is verified, codes are only delivered to that address).

To point the app at a local Worker instead, start `wrangler dev` and set `EXPO_PUBLIC_API_URL` to your laptop's address, for example `EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 npx expo start`.

## What is in it

- Sign in with an emailed 6-digit code. The session token is kept in `expo-secure-store`.
- Explore (filter by topic), challenge detail, follow an organisation.
- Create or join a team with an invite code, fill in the application questions, update or withdraw.
- Pitch for shortlisted teams: upload a PDF deck from Files, add video and demo links and notes.
- My teams with the status stamps, inbox, certificates (opened as a PDF), profile, topic interests.

- Global events: a tab of hackathons and opportunities from outside Kakushin, each with its own page and official link. Anyone signed in can suggest one.
- Save a challenge or a global event (the bookmark on its banner), see them under the bookmark on Explore, and get a reminder before they close.
- Add a challenge's or an event's dates to the phone's calendar, and report a listing that looks wrong.

## Layout

```
app/                  Expo Router screens: (tabs)/index, teams, inbox, profile; sign-in; challenge/[org]/[slug]; pitch/[team]
components/ui.tsx     buttons, fields, cards, the status stamp
lib/api.ts            fetch client with bearer token and Zod-checked responses
lib/schemas.ts        Zod schemas for the Worker responses the app uses
lib/auth.tsx          sign-in state
```

## Checks

`npm run typecheck`. `npx expo export --platform ios` bundles the app without a device. `npx expo export --platform web` plus a static server gives a browser preview (secure storage does not exist on the web, so a page reload signs you out there; on a phone it persists).

## Push notifications

The app registers an Expo push token after sign-in and the Worker sends pushes for announcements, platform news, shortlists, results, certificates and new challenges that match your topics. Turn it off under Profile > Notifications. Push needs a real phone. In Expo Go on iPhone it works for testing; a standalone build needs an EAS project id in `app.json` (`extra.eas.projectId`) and Apple push credentials.
