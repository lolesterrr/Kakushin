# 04. Eight-day schedule

Goal: a deployed, working system where a real organiser can run a small challenge end to end, with the admin portal, public portal and Expo mobile app all working.

Each day ends with something deployed. Eight days leaves slack, so no day should be rushed. If a day slips, cut from the "stretch" list, never from the core flow.

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

## Day 5: Results and certificates
- Mark winners and placements, publish results page
- Certificate PDFs (pdf-lib), stored in R2, download from profile
- Public `/verify/:code` page with QR code on the certificate
- Participant profile shows events and certificates
- Notifications table, inbox API, follow organisation and interest topics
- **Done when:** results publish and every participant can download a verifiable certificate.

## Day 6: Mobile app
- Expo app scaffolded with Expo Router, shared types and Zod schemas
- 6-digit code sign-in, token in secure storage
- Screens: explore, challenge detail, apply, my teams and status, certificates, profile, follow orgs and pick topics
- **Done when:** you can sign in on your iPhone in Expo Go and apply to a challenge.

## Day 7: Notifications and admin polish
- Discovery fan-out: publishing a challenge notifies followers and topic matches
- Organiser announcements and platform news posting
- Notification settings screen (topics, push on/off, email digest)
- Register Expo push token as a delivery channel; send on shortlist, results, certificate ready and new matching challenge
- Notification inbox screen, tap a push to open the right screen
- Admin portal polish: dashboard stats, org admin invites, empty states
- **Done when:** publishing a challenge in a topic you follow shows up in your phone's feed and sends a push, and you can switch push off in settings.

## Day 8: Hardening and demo
- Mobile pass on the web app, error handling, audit log
- Tests for scoring formula, permissions and tenant isolation
- Seed a demo organisation and challenge
- Full dry run: run a fake hackathon from posting to certificates using web and phone
- Fix whatever the dry run finds
- **Done when:** the whole flow runs on production with a demo dataset, with no known blockers.

## Stretch (only if ahead)
- Hourly cron to auto-close applications and send pitch reminders
- Org admin invites (multiple admins)
- Custom certificate template colours per org
- Simple stats on the organiser dashboard (applicants, institutions, gender split)

## Risks and how we handle them

| Risk | Plan |
|---|---|
| PDF generation hits the free CPU limit | Switch to Workers Paid ($5/month) on day 5 if needed |
| Resend free only emails the account owner without a verified domain | Fine while joe is the only tester; buy a domain before inviting others |
| Push notifications behave differently from the docs | Day 7 has slack; the in-app inbox works without push |
| Scope creep | Anything not in docs/01 goes to the later-phase list |
| Judging logic bugs | Unit tests for the scoring formula on day 4 |

## Open questions for joe
- Is there a real organiser or event to demo to at the end of the week?
- Domain: skipped for now (workers.dev). Needed before anyone besides joe gets emails.
- Cloudflare, Resend and Expo accounts ready?
