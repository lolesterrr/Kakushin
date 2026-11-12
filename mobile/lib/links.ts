/** Links from the Worker are web paths. Map the ones the app has a screen for; anything else returns null. */
export function appRoute(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = /^\/o\/([^/]+)\/c\/([^/]+)/.exec(link);
  if (m) return `/challenge/${m[1]}/${m[2]}`;
  if (link.startsWith("/profile")) return "/profile";
  if (link.startsWith("/teams") || link.startsWith("/team")) return "/teams";
  if (link === "/inbox" || link.startsWith("/inbox")) return "/inbox";
  // Organisation pages, certificates and anything else only exist on the web, so open the inbox instead.
  return "/inbox";
}
