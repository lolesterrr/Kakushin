import type { Env } from "../types";

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/**
 * "owner/name" from a github.com repository link, or null. Only plain repo links count: https://github.com/owner/name,
 * with an optional trailing slash or .git. Anything else (gists, other hosts, deeper paths) is refused.
 */
export function parseRepo(url: string): string | null {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/\s?#]+)\/([^/\s?#]+?)(?:\.git)?\/?$/i.exec(url.trim());
  if (!m || !LOGIN.test(m[1]!) || !NAME.test(m[2]!) || m[2] === "." || m[2] === "..") return null;
  return `${m[1]}/${m[2]}`;
}

/** The stored form of a repo link. */
export const repoUrl = (repo: string) => `https://github.com/${repo}`;

/** The GitHub login in a profile link such as https://github.com/amy, or null. */
export function loginFromProfile(link: string | undefined | null): string | null {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/\s?#]+)\/?$/i.exec((link ?? "").trim());
  return m && LOGIN.test(m[1]!) ? m[1]!.toLowerCase() : null;
}

export interface RepoStats { ok: true; contributors: { login: string; commits: number }[]; fetched_at: number }
export interface RepoError { ok: false; reason: "not_found" | "rate_limited" | "unavailable"; fetched_at: number }

const HOUR = 3600 * 1000;
/** A failed lookup is kept for 10 minutes, so a team that makes its repo public shows up soon after. */
const FAIL_TTL = 10 * 60 * 1000;

/**
 * Contributors and their commit counts on the default branch, from GitHub, cached for an hour in D1.
 * Uses GITHUB_TOKEN when it is set; without it GitHub allows 60 calls an hour per address.
 */
export async function repoStats(env: Env, repo: string, now = Date.now()): Promise<RepoStats | RepoError> {
  const key = repo.toLowerCase();
  const cached = await env.DB.prepare("SELECT data, fetched_at FROM github_cache WHERE repo = ?").bind(key).first<{ data: string; fetched_at: number }>();
  if (cached) {
    const v = JSON.parse(cached.data) as RepoStats | RepoError;
    if (now - cached.fetched_at < (v.ok ? HOUR : FAIL_TTL)) return { ...v, fetched_at: cached.fetched_at };
  }
  let out: RepoStats | RepoError;
  try {
    const res = await fetch(`${env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${repo}/contributors?per_page=100`, {
      headers: {
        Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Kakushin",
        ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (res.status === 204) out = { ok: true, contributors: [], fetched_at: now }; // an empty repo
    else if (res.ok) {
      const list = (await res.json()) as { login?: string; contributions?: number; type?: string }[];
      out = {
        ok: true, fetched_at: now,
        contributors: (Array.isArray(list) ? list : []).filter((r) => r.login && r.type !== "Bot" && !r.login.endsWith("[bot]"))
          .map((r) => ({ login: r.login!, commits: Number(r.contributions) || 0 })),
      };
    } else if (res.status === 404 || res.status === 451) out = { ok: false, reason: "not_found", fetched_at: now };
    else if (res.status === 403 || res.status === 429) out = { ok: false, reason: "rate_limited", fetched_at: now };
    else out = { ok: false, reason: "unavailable", fetched_at: now };
  } catch (e) {
    console.error(`github lookup failed: ${e instanceof Error ? e.message : e}`);
    return { ok: false, reason: "unavailable", fetched_at: now }; // not cached: try again next time
  }
  if (out.ok || out.reason !== "unavailable") {
    await env.DB.prepare("INSERT INTO github_cache (repo, data, fetched_at) VALUES (?, ?, ?) ON CONFLICT(repo) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at")
      .bind(key, JSON.stringify(out), now).run();
  }
  return out;
}

export interface MemberLink { name: string; login: string | null }

/**
 * Matches contributors to team members by the GitHub link on their profile, most commits first.
 * Members with no commits are listed too, so judges can see who did not push code.
 */
export function matchContributors(contributors: { login: string; commits: number }[], members: MemberLink[]) {
  const byLogin = new Map(members.filter((m) => m.login).map((m) => [m.login!, m]));
  const rows = contributors
    .map((c) => ({ login: c.login, commits: c.commits, member: byLogin.get(c.login.toLowerCase())?.name ?? null }))
    .sort((a, b) => b.commits - a.commits);
  const seen = new Set(contributors.map((c) => c.login.toLowerCase()));
  return {
    contributors: rows,
    not_on_team: rows.filter((r) => !r.member).length,
    no_commits: members.filter((m) => !m.login || !seen.has(m.login)).map((m) => ({ name: m.name, linked: !!m.login })),
  };
}
