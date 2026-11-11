# 03. Architecture

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| API | Cloudflare Workers + Hono | Fast, tiny, edge-hosted. Hono is the standard router for Workers |
| Database | Cloudflare D1 (SQLite) + Drizzle ORM | Generous free tier, zero ops, typed queries and migrations |
| Files | Cloudflare R2 | 10 GB free and **zero egress fees**, which no S3-style competitor matches |
| Mobile | Expo (React Native, TypeScript) + Expo Router, run in Expo Go | Test on a real iPhone with no build step; shares types and Zod schemas with the web app |
| Push | Expo Push Service via `expo-notifications` | Free; one API for iOS and Android; no Apple or Firebase setup while using Expo Go |
| Frontend | React + Vite + TanStack Router/Query + Tailwind + shadcn/ui | Fast to build forms and dashboards; served as Workers static assets |
| Email | Resend | 3,000 emails/month free, simple API, good deliverability |
| Bot protection | Cloudflare Turnstile | Free, no annoying puzzles, protects login and apply forms |
| Scheduled jobs | Workers Cron Triggers | Auto-close applications, send reminders |
| PDFs | pdf-lib inside the Worker | Pure JS, runs on Workers, no headless browser needed |
| Validation | Zod (shared between API and frontend) | One schema, both sides |

Language: TypeScript everywhere.

## Why Cloudflare wins here

| Need | Cloudflare free tier | Typical alternative |
|---|---|---|
| Compute | 100k requests/day | Vercel/Netlify functions, cold starts, tighter limits |
| Database | D1: 5 GB, 5M rows read/day, 100k rows written/day | Supabase free pauses after a week idle; Neon free has compute-hour caps |
| File storage | R2: 10 GB, zero egress | S3 charges for every download (pitch decks and certificates get downloaded a lot) |
| Static hosting | Unlimited static asset requests | Fine everywhere, but one deploy with the API is simpler |
| Bot protection | Turnstile free | reCAPTCHA is free but heavier and less private |

Where Cloudflare does not win: **sending email**. Resend is the pick there.

Limits to verify before launch (from Cloudflare's pricing pages, these can change).

## One Worker, one deploy

```
Browser ──► Worker (kakushin)
              ├── /api/*        Hono routes  ──► D1 (data)
              │                              ──► R2 (files)
              │                              ──► Resend (email)
              └── everything else → static assets (React SPA)

Expo app ──► same /api/* routes (bearer token) ──► Expo Push Service ──► iPhone

Cron trigger (hourly) ──► same Worker: close deadlines, send reminders
```

The React app and the API ship as one Worker using static assets. Same origin means no CORS and session cookies just work.

## Repo layout (planned)

```
kakushin/
├── docs/                  planning docs
├── src/                   Worker (API)
│   ├── index.ts           Hono app, mounts routes, serves assets
│   ├── db/schema.ts       Drizzle schema
│   ├── routes/            auth, orgs, challenges, teams, applications, judging, certificates
│   ├── lib/               auth, email, pdf, permissions, ids
│   └── cron.ts
├── migrations/            D1 SQL migrations (drizzle-kit)
├── web/                   React app (Vite)
│   └── src/routes/        public portal, participant dashboard, /admin (organiser console, judge view)
├── mobile/                Expo app (participants)
├── shared/                Zod schemas and types used by both sides
└── wrangler.jsonc
```

## Free tier only (current rule)

Everything runs on free tiers while it is just joe testing:

| Service | Free tier used | Cost |
|---|---|---|
| Workers, D1, R2, Turnstile | Cloudflare free plans | $0 |
| Email | Resend free (100/day, 3,000/month) | $0 |
| Push | Expo Push Service | $0 |
| Mobile testing | Expo Go on iPhone | $0 |
| Domain | Skipped; use `*.workers.dev` | $0 |

Consequences to know about:
- Resend without a verified domain can only send to your own account email. That is fine for solo testing. A domain (about $10 to $15/year) is needed before inviting anyone else.
- The free Workers CPU cap (about 10 ms per request) may break certificate PDF generation. We write it to be cheap, test it, and only pay the $5/month plan if it actually fails.
- Expo Go limits: push notifications work on iPhone in Expo Go with a physical device. Android push no longer works in Expo Go (needs a development build). Store releases need EAS builds, and iOS push in a real build needs a paid Apple Developer account ($99/year). All of that is later.

Check the current Expo and Cloudflare docs on day 1 and day 5, since limits move.

## Mobile app

```
mobile/                 Expo app (Expo Router)
  app/                  screens: sign-in, explore, challenge, apply, my-teams, notifications, certificates, profile
  lib/api.ts            typed client for the Worker API (shared Zod schemas)
```

- **Login on mobile:** emailed 6-digit code, not a magic link, because deep links are awkward inside Expo Go. The code is exchanged for a long-lived bearer token stored in `expo-secure-store`. The web keeps cookie sessions; the API accepts either.
- **Push flow:** after login the app asks for notification permission, gets an Expo push token, and POSTs it to `/api/push-tokens`. When something happens (shortlisted, results published, certificate ready) the Worker writes a `notifications` row, then calls Expo's push API (`https://exp.host/--/api/v2/push/send`, batches of up to 100) and prunes tokens Expo reports as invalid.
- **API target:** the app points at the deployed workers.dev URL, so the phone does not depend on the laptop being on the same network.

## Auth

- Magic links: user enters email, we store a hashed single-use token (15 min), email the link.
- Clicking the link creates a session row in D1 and sets an `HttpOnly; Secure; SameSite=Lax` cookie (30 days).
- Turnstile on the email form so nobody can burn our email quota.
- Permissions are checked in middleware: `requireOrgRole(orgId, ['owner','admin'])`, `requireJudge(challengeId)`, `requireTeamMember(teamId)`.

## Files (R2)

- Uploads go through the Worker using the R2 binding (simple, and the 100 MB request limit is plenty for 20 MB decks).
- Keys are namespaced: `orgs/{orgId}/logo`, `challenges/{id}/cover`, `teams/{id}/deck.pdf`, `certs/{code}.pdf`.
- Private files (pitch decks) are streamed through an API route that checks permissions. Public files (logos, covers, certificates) are served with long cache headers.

## Certificates

1. Organiser publishes results.
2. The Worker creates certificate rows (one per team member, kind based on team status) with a short unique code.
3. PDFs are built with pdf-lib from a template (org logo, name, challenge, title, date, verify URL and QR code), saved to R2.
4. Anyone can visit `/verify/:code` to confirm it is real.

Watch out: the free Workers plan caps CPU at 10 ms per request. Generating PDFs will likely go over that. Options:
- Generate in small batches through cron and `ctx.waitUntil` (may still hit the cap), or
- Move to **Workers Paid ($5/month)**, which raises the CPU limit massively and also raises D1 limits. Recommended before the first real event.

## Email moments

| Trigger | To |
|---|---|
| Login link | user |
| Application submitted | team members |
| Shortlisted / rejected | team members |
| Pitch deadline reminder (cron) | shortlisted teams |
| Judge invite | judge |
| Results published, certificate ready | all participants |

Resend free tier is 100 emails/day, so a results blast to 300 people needs the paid tier or batching across days. Fine for the pilot, upgrade when a real customer pays.

## Multi-tenancy

- Shared database, `org_id` on every tenant row, enforced in a query helper so nobody forgets.
- Org pages live at `/o/:slug` and challenges at `/o/:slug/c/:challengeSlug`.
- Custom subdomains and domains come later (Cloudflare for SaaS can do it).

## Environments

| Env | What |
|---|---|
| local | `wrangler dev` with local D1 and R2 |
| preview | `wrangler deploy --env preview`, own D1 database |
| production | `wrangler deploy`, on `*.workers.dev` until a domain is bought |

CI: GitHub Actions runs typecheck and tests, and deploys main to production with a Cloudflare API token secret.
