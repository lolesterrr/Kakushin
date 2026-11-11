# 04. Five-day schedule

Goal: a deployed, working system where a real organiser can run a small challenge end to end.

Each day ends with something deployed. If a day slips, cut from the "stretch" list, never from the core flow.

## Day 1: Foundations and auth
- Scaffold Worker (Hono) + React (Vite) in one project, static assets wired up
- D1 schema and first migration (users, sessions, login_tokens, organizations, memberships)
- Magic-link login with Resend + Turnstile, session middleware
- Basic layout, nav, profile edit page
- Deploy to workers.dev
- **Done when:** you can sign in on your phone from the live URL and edit your profile.

## Day 2: Organisations and challenges
- Create organisation, org settings, logo upload to R2
- Challenge CRUD with timeline, team size, prizes, cover image
- Custom application question builder
- Public org page and public challenge page
- Explore page listing open challenges
- **Done when:** an organiser can publish a challenge and share its link.

## Day 3: Teams and applications
- Create team, join with invite code/link, leave, team lead
- Application form rendered from the challenge's questions
- Organiser application inbox: filters, view answers, shortlist/reject, bulk actions, notes
- Emails: application received, shortlisted, rejected
- CSV export of applications
- **Done when:** a team can apply and the organiser can shortlist them.

## Day 4: Pitches and judging
- Pitch submission (deck upload, video and demo links)
- Rubric builder (criteria, weights, max score)
- Invite judges by email, auto-assign all finalists
- Judge view: list of assigned teams, deck viewer, score form, comments, progress
- Organiser leaderboard with weighted totals and per-judge breakdown
- **Done when:** two judges can score three teams and the leaderboard is correct.

## Day 5: Results, certificates, polish
- Mark winners and placements, publish results page
- Certificate PDFs (pdf-lib), stored in R2, download from profile
- Public `/verify/:code` page with QR code on the certificate
- Participant profile shows events and certificates
- Mobile pass, empty states, error handling, audit log
- Seed a demo organisation and challenge for showing to customers
- **Done when:** the whole flow runs on production with a demo dataset.

## Stretch (only if ahead)
- Hourly cron to auto-close applications and send pitch reminders
- Org admin invites (multiple admins)
- Custom certificate template colours per org
- Simple stats on the organiser dashboard (applicants, institutions, gender split)

## Risks and how we handle them

| Risk | Plan |
|---|---|
| PDF generation hits the free CPU limit | Switch to Workers Paid ($5/month) on day 5 if needed |
| Email lands in spam | Verify a sending domain in Resend early (needs a domain, see open questions) |
| Scope creep | Anything not in docs/01 goes to the later-phase list |
| Judging logic bugs | Unit tests for the scoring formula on day 4 |

## Open questions for joe
- Is there a real organiser or event to demo to at the end of the week?
- Do we have a domain (e.g. kakushin.app / kakushin.africa)? Needed for email sending.
- Cloudflare account ready, and Resend account?
