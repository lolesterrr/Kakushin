/** Links from the Worker are web paths. Map the ones the app has a screen for; anything else returns null. */
export function appRoute(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = /^\/o\/([^/#?]+)\/c\/([^/#?]+)/.exec(link);
  if (m) return /#results/.test(link) ? `/results/${m[1]}/${m[2]}` : /^\/o\/[^/]+\/c\/[^/#?]+\/live/.test(link) ? `/live/${m[1]}/${m[2]}` : `/challenge/${m[1]}/${m[2]}`;
  const jd = /^\/judge\/([^/#?]+)\/([^/#?]+)/.exec(link);
  if (jd) return `/judge/${jd[1]}/${jd[2]}`;
  const o = /^\/o\/([^/#?]+)\/?$/.exec(link);
  if (o) return `/org/${o[1]}`;
  const j = /^\/join\/([A-Za-z0-9]+)/.exec(link);
  if (j) return `/join/${j[1]}`;
  if (link.startsWith("/certificates") || link.startsWith("/verify")) return "/profile";
  if (link.startsWith("/profile")) return "/profile";
  if (link.startsWith("/teams") || link.startsWith("/team")) return "/teams";
  if (link === "/inbox" || link.startsWith("/inbox")) return "/inbox";
  // Anything else only exists on the web, so open the inbox instead.
  return "/inbox";
}
