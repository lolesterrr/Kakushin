# 01. Scope and MVP

## Three surfaces

| Surface | Who uses it | What it is |
|---|---|---|
| Public portal | Anyone, participants | Browse organisations and open challenges, sign in, apply, manage team, view profile and certificates |
| Admin portal | Organisers, judges, platform admin | Organisation console at `/admin`: challenges, applications, judging, results, certificates |
| Mobile app | Participants (judges later) | Expo app: browse challenges, apply, see team and status, receive push notifications, show certificates |

The public and admin portals are one React web app with separate route areas, sharing one login and one API. The mobile app uses the same API.

## The one flow the MVP must nail

1. An organiser creates an organisation and posts a challenge.
2. Participants sign up, build a profile, form or join a team, and apply.
3. The organiser reviews applications and shortlists teams.
4. Shortlisted teams upload a pitch (deck and/or video link).
5. Judges score each pitch against a weighted rubric.
6. The organiser sees a live leaderboard, then publishes results.
7. Every participant gets a certificate (participant, finalist or winner) with a public verification link.

If this flow works end to end by day 8, the MVP is done. Everything else is a later phase.

## Roles

| Role | Scope | Can do |
|---|---|---|
| Platform admin | Whole platform | Manage organisations, plans, support |
| Org owner / admin | One organisation | Create challenges, manage applications, invite judges, issue certificates |
| Judge | Assigned challenges | Score assigned teams, leave comments |
| Participant | Own profile and teams | Apply, manage team, upload pitch, download certificates |

A single user can hold different roles in different organisations (a lecturer can be a judge at one hub and a participant at another).

## In the MVP (8 days)

- Magic-link email login (no passwords)
- Organisation creation, with a public page at `/o/:slug`
- Challenge CRUD: title, description, cover image, prizes, timeline dates, team size limits, status
- Custom application questions per challenge (short text, long text, choice, URL)
- Public challenge page with an Apply button
- Teams: create, invite by code or link, leave, team lead
- Applications: submit, review list with filters, shortlist or reject, bulk actions
- Pitch submission: deck upload to R2 plus video/demo link
- Judging: rubric criteria with weights, judge invites, judge assignment, score form, comments
- Leaderboard: weighted average per team, per-judge breakdown for organisers
- Results: mark winners and finalists, publish
- Certificates: PDF generated per participant, stored in R2, public verify page `/verify/:code`
- Participant profile: name, photo, bio, institution, skills, links, history of events and certificates
- Email notifications for key moments (login link, application received, shortlisted, results, certificate ready)
- CSV export of applications and scores
- Discovery feed and alerts: participants follow organisations and pick interest topics (e.g. fintech, health, agritech, climate, AI). They get notified when a followed organisation or a matching topic has a new challenge, and when deadlines are close
- Announcements: organisers post updates to their followers (new challenge, event dates, info sessions, winners). The platform admin can post platform-wide innovation news
- Per-user notification settings: choose topics, choose channels (in-app, email digest, push)
- Mobile app (Expo, tested in Expo Go on iPhone): sign in with an emailed 6-digit code, browse and apply to challenges, follow organisations and topics, discovery feed, my teams and statuses, my certificates, notification inbox

## Later phases (not in 8 days)

| Phase | Features |
|---|---|
| Phase 2 | Payments and plans (Flutterwave / Pesapal for mobile money), custom branding, multi-stage challenges (idea round, then build round), mentor booking |
| Phase 2b | Store builds with EAS (needs a paid Apple Developer account, $99/year), judge scoring on mobile, deep links |
| Phase 3 | Impact reports for development partners (demographics, gender split, institutions reached), announcements and messaging, Google sign-in, custom domains |
| Phase 4 | Public talent directory for sponsors, team matchmaking by skills, API and webhooks, WhatsApp/SMS notifications (Africa's Talking) |

## Explicit non-goals for the MVP

- No payments or billing. Plans are set manually by the platform admin.
- No real-time chat.
- No app store release. The mobile app is tested in Expo Go only. Store builds come later.
- The mobile app is participant-first. Organiser and judge tools stay in the web admin portal for now.
- The web app must still work well on phones.
- No custom domains per organisation.

## Assumptions (to confirm)

- Login is magic-link email only.
- One organisation per challenge (no co-hosted challenges yet).
- Judges are invited by email and do not need to be organisation members.
- Solo participants are a "team of one".
