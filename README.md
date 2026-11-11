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
