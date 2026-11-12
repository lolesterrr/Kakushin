# Kakushin

Kakushin (革新, "innovation") is a SaaS platform for running hackathons and innovation challenges end to end.

Organisers post challenges, take applications, track teams, score pitches with judges, and issue verifiable certificates. Participants keep one profile across every event they join.

Built for universities, innovation hubs, corporates and development partners that run innovation events on a regular basis.

## Planning docs

| Doc | What's in it |
|---|---|
| [01 Scope and MVP](docs/01-scope-mvp.md) | What we build in 8 days, and what waits |
| [02 Data model](docs/02-data-model.md) | Tables, relationships, statuses |
| [03 Architecture](docs/03-architecture.md) | Stack, Cloudflare services, auth, files, email, limits |
| [04 Schedule](docs/04-schedule.md) | Day-by-day plan to a running system |
| [05 Business](docs/05-business.md) | Customers, pricing, go-to-market |

## Stack (short version)

Cloudflare Workers (Hono) for the API, D1 for the database, R2 for files, Resend for email. One React web app serves both the public portal and the admin portal. A React Native app (Expo) covers participants on mobile, with push notifications. Everything runs on free tiers while it is just one tester.

## Local development

```
npm install
cp .dev.vars.example .dev.vars        # RESEND_API_KEY optional; without it emails are logged to the console
npm run db:migrate:local
npm run build:web
npm run dev                            # http://localhost:8787
```

Without a `RESEND_API_KEY`, the sign-in link or code is printed in the `wrangler dev` output.

## Live

Day 1 runs at https://kakushin.kajjabantu.workers.dev (D1 database `kakushin`, R2 bucket `kakushin-files`, secret `RESEND_API_KEY`).

```
npm run db:migrate:remote
npm run deploy
```

Day 2 (organisations and challenges): create an org at `/admin`, add challenges, publish, and share `/o/<org>/c/<challenge>`. Open challenges list on Explore (`/`).

Day 3 (teams and applications): participants create or join teams (invite link or code), the team lead applies, and organisers review at `/admin/o/<org>/c/<challenge>/applications` (shortlist, reject, bulk, notes, CSV). Emails go out on received, shortlisted and rejected.

Day 4 (pitches and judging): finalists add a pitch (PDF deck, video, demo link). Organisers set weighted criteria, invite judges by email and start judging at `.../judging`. Judges score at `/judge`. The leaderboard averages the judges who finished each team.

Day 5 (results and certificates): organisers place winners and publish at `.../results`. Publishing issues one certificate per member of a shortlisted, finalist or winning team. The PDF (pdf-lib, QR code) is made on first download and kept in R2. Anyone can check a certificate at `/verify/<code>`. Also an inbox at `/inbox`, following organisations and topic interests (new-challenge notifications).

Day 6 (mobile app): `mobile/` is an Expo (SDK 58, Expo Router) app for participants: code sign-in, explore, apply with a team, my teams, inbox, certificates, profile and topics. See `mobile/README.md` for running it in Expo Go.

Notes:
- Resend has no verified domain yet, so it only delivers to the Resend account's own address. Any other email gets a 500 on sign-in request.
- Editing a secret in the dashboard saves a new version but may not deploy it. Check the Deployments tab.
- Workers logs are on (`observability`), so errors show in the dashboard under the Worker's Logs tab.

## Tests and demo data

- `npm test` runs the unit tests (scoring formula).
- `npm run test:e2e` runs 50+ permission and tenant-isolation checks against a local `npm run dev`. It only talks to localhost.
- `node scripts/dryrun.mjs` runs a whole fake hackathon (post, apply, shortlist, judge, results, certificates) against local. Add `--live` to run it on production; it cleans up after itself.
- `node scripts/demo/seed-demo.mjs [--live]` builds the presentation dataset: 5 organisations with logos, 9 challenges with covers at every stage, teams, pitch decks, scores, winners and certificates. Run it again to rebuild from scratch, or add `--cleanup` to remove it. Images and decks live in `scripts/demo/media` (regenerate with `scripts/demo/make-media.mjs`).

## Turnstile (bot check on the web sign-in form)

It is built but off. To turn it on, create a Turnstile widget in the Cloudflare dashboard for `kakushin.kajjabantu.workers.dev`, then set `TURNSTILE_SITE_KEY` as a variable and `TURNSTILE_SECRET` as a secret (`npx wrangler secret put TURNSTILE_SECRET`) and redeploy. The phone app skips the widget and relies on the per-email limits (5 code requests an hour, 5 wrong codes then a lock).
