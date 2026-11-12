// The app talks to the deployed Worker, so the phone does not depend on the laptop being on the same network.
// Override with EXPO_PUBLIC_API_URL when testing against a local `wrangler dev`.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://kakushin.dpdns.org").replace(/\/$/, "");
