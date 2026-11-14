# 07. Fix plan, days 4 to 6

Days 4 to 6 (14 to 16 Nov 2026) of the fix plan: fairer judging, richer challenge pages and discovery, and event day. They turn the "Days 4 to 6 (next plan)" backlog into workstreams, in the same format as days 1 to 3.

The live copy is the [Kakushin fix plan doc](https://claude.ai/artifact/2ZhhRGmDyAshKmAAv7WQBH). Threads tick tasks there as they merge and link their PR next to the heading. This file is a snapshot of days 4 to 6 so the plan also lives with the code.

## How threads use this plan

- Each workstream (4A, 4B, ...) is one branch and one pull request, branched from `main`. Branch names are plain, no `クロード/` prefix.
- Before merging: `npm run typecheck`, `npm test`, `npm run test:e2e` against local dev, and `cd mobile && npm run typecheck` for app changes.
- Deploys run from the cloud environment: `npm run db:migrate:remote` then `npm run deploy`.
- Migrations 0011 to 0016 are claimed below, one per workstream, so no two threads take the same number. They are independent of each other, so merge order does not matter.
- New work found along the way goes under Later, not into a growing PR.

## Day 4: judging and review organisers can trust

By the end of day 4 (14 Nov), every finalist gets a balanced set of judges, organisers score applications with their own rubric, and they can message any group of applicants.

Start day 4 from `main` after PR #21 (day 3) is merged, so the mobile work on day 6 builds on it. 4A and 4B touch different files (judging versus applications and announcements) and can run side by side.

### 4A. Fair judging (thread, branch `day4-judging`, migration `0011_judging.sql`)

Today every invited judge sees every finalist, sees member names, and the leaderboard is a raw average. That is unfair when judges score on different scales or know a team.

- [ ] Judge assignments: new table `judge_assignments` (challenge, judge email, team). The organiser sets "each team gets N judges" (default 3) and presses Auto-assign, which spreads finalists evenly; they can also add or remove one judge on one team. With no assignments, judges see every finalist as today
- [ ] The judge list, team view and score routes in `src/routes/judging.ts` only allow assigned teams once a challenge has assignments
- [ ] Conflict of interest: a judge can press "I know this team". The team leaves their list, their scores for it are removed, and the organiser sees the flag and can reassign. Own-team blocking stays as it is
- [ ] Blind review: a per-challenge setting (`challenges.blind_judging`, off by default, decision D3). When on, judges see the team name and pitch but not member names or institutions
- [ ] Calibration view for organisers: for each judge, teams scored, their average and spread, and the gap to the panel average. Judges more than 1.5 points off the panel are flagged
- [ ] Leaderboard can rank by normalised scores (each judge's scores rescaled to their own average and spread), shown next to the raw rank, and both go in the CSV
- [ ] Progress per team for organisers, for example "2 of 3 judges done"
- [ ] New `tests/e2e/day4.mjs` covers assignment, conflict, blind fields hidden from judges, and normalised ranking; add it to `npm run test:e2e`

### 4B. Application review and group messages (thread, branch `day4-review-messages`, migration `0012_review_messages.sql`)

Today reviewers only have a free-text note per application, and announcements only reach an organisation's followers, not the people in a challenge.

- [ ] Application rubric: `criteria` gets a `stage` column (`application` or `pitch`, existing rows become `pitch`). The organiser sets application criteria in the challenge editor; they lock once the challenge reaches judging, like the pitch rubric
- [ ] New table `application_scores` (reviewer, team, criterion, score, comment). Any organisation admin can score on the Applications page. The list shows the average and the number of reviewers, sorts by it, and the CSV includes it
- [ ] "Shortlist the top N" button that selects the highest-scored teams for the organiser to confirm, using the existing status route
- [ ] Group messages: a Messages panel on the challenge with audiences all applied, shortlisted, finalists, not selected, or one team. Each member gets an inbox item and a push. Stored in `announcements` with new `challenge_id` and `audience` columns, limited to 10 a day per challenge
- [ ] Email copies of group messages through the existing results queue, only if Joe says yes (decision D1)
- [ ] Team members see the message in Inbox on web and mobile, and its link opens the challenge
- [ ] Cases for the rubric, shortlist and each audience in `tests/e2e/day4.mjs`

### Joe on day 4

- [ ] Answer decisions D1 to D4 below (5 minutes)
- [ ] Merge PR #21 (day 3) after the Expo Go check, so day 4 branches start from it

## Day 5: challenge pages and discovery

By the end of day 5 (15 Nov), a challenge page has everything a participant needs before applying, and people can search challenges, find a team and show their work.

### 5A. Full challenge pages (thread, branch `day5-challenge-pages`, migration `0013_challenge_pages.sql`)

Today the description and prizes are plain text in one box, so rules, FAQ, sponsors and the timeline all get squeezed into it.

- [ ] Description, rules and prizes render as Markdown: headings, lists, bold, links and images from our own uploads. No raw HTML, and links must be http or https. The editor gets a preview. One small renderer in the web app; the mobile challenge screen shows the same text with basic formatting
- [ ] New challenge fields: rules (Markdown), FAQ (question and answer pairs), sponsors (name, logo, link) and timeline (label and date pairs), stored as JSON columns on `challenges`
- [ ] Public judges section: a judge can add a display name and title, and judges appear only when the organiser ticks "Show judges on the page"
- [ ] The public page gets sections for Overview, Rules, Timeline, Prizes, Judges, Sponsors and FAQ, with the existing "how you will be scored" block. The share card from day 1 still works
- [ ] Duplicate a challenge: copies text, questions, both rubrics, sponsors and FAQ into a new draft with dates cleared and no teams
- [ ] Organisation ownership transfer: the owner hands the owner role to another admin, with a confirm step. Today the role only moves when the owner deletes their account

### 5B. Explore and people (thread, branch `day5-explore-people`, migration `0014_profiles.sql`)

Today Explore lists at most 60 open challenges with one topic filter, and nobody can see who else is taking part.

- [ ] Explore API gains `q` (title, summary and organisation), team size and sort (closing soon or newest) parameters, plus a cursor for paging past 60. The web Explore gets a search box, filters and Load more; the mobile Explore gets the search box
- [ ] Past winners view on web: completed challenges with published results, newest first, linking to the results page
- [ ] Public profiles at `/u/:handle`, off until a person turns them on (`users.handle`, `users.public_profile`). Shows name, bio, skills, links, certificates and past teams. Never shows the email address
- [ ] Project gallery: finalist and winner pitches from completed challenges, on the organisation page and the results page, following decision D2
- [ ] Team finder: on an open challenge, a signed-in person can tick "Looking for a team" with a short note. Signed-in people see the list, and a team lead can send them an invite, which lands in their inbox with the join link
- [ ] Who's coming: participant and team counts on every challenge page for everyone; names only for people who ticked "Looking for a team" or have a public profile, and only to signed-in people
- [ ] Cases for search, paging, profile privacy (a private profile returns 404) and team finder invites in a new `tests/e2e/day5.mjs`

## Day 6: event day

By the end of day 6 (16 Nov), an organiser can run a live hackathon from Kakushin: agenda and countdown on screen, check-in at the door, judges scoring on their phones, and code linked to each pitch.

### 6A. Live mode and check-in (thread, branch `day6-live-mode`, migration `0015_live_mode.sql`)

This is the participant's flow from the lessons in the fix plan: briefing, about 2 hours of ideas, about 5 hours of building, then a hard stop.

- [ ] Agenda: the organiser adds blocks (briefing, ideation, build, pitching, results) with start and end times, stored in a new `challenge_agenda` table. The timeline from 5A shows the agenda when one exists
- [ ] Live page at `/o/:org/c/:slug/live` and a Live screen in the app: the current block, a big countdown to its end and to the submission cutoff, and the latest group messages from 4B. It refreshes every 30 seconds, no websockets
- [ ] Hard cutoff: the server already refuses pitches after `pitch_due_at`. Live mode adds pushes 30, 10 and 1 minutes before it, and shows "Submissions closed" the moment it passes
- [ ] A second cron, every 5 minutes, in `wrangler.jsonc` next to the hourly one. It only does work when an agenda block or cutoff falls in the next 5 minutes, and pushes "Build starts now" style messages to participants
- [ ] QR check-in, turned on per challenge for in-person events: each member gets a check-in QR in the app and on web (a signed code, not the invite code). Organisers scan it from a Check-in screen in the app with `expo-camera`, which works in Expo Go. New `check_ins` table; the organiser sees the count and list, and can check someone in by name if their phone is dead
- [ ] Cases for agenda, cutoff and check-in in a new `tests/e2e/day6.mjs`

### 6B. Judge mode in the app and GitHub repos (thread, branch `day6-mobile-judge`, migration `0016_pitch_repo.sql`)

- [ ] Judge tab in the app, shown only to people with judge invites: their assigned teams, the pitch, the deck in the viewer, and scoring per criterion with comments. It follows blind review and conflicts from 4A
- [ ] Scores save on the phone when the network drops and send when it is back, so a judge in a noisy venue does not lose work
- [ ] Pitch gets a GitHub repo field on web and mobile (public github.com repos only)
- [ ] The Worker reads the repo's contributors and commit counts from the GitHub API, caches them for an hour, and matches them to members by the GitHub link on their profile. Judges see, for example, "Amy 42 commits, Ben 3, 1 not on the team"
- [ ] Store a `GITHUB_TOKEN` secret, because unauthenticated GitHub calls allow only 60 an hour and Workers share addresses (thread, once Joe makes the token)
- [ ] Deploy days 4 to 6 (migrations 0011 to 0016, then the app) and run `node scripts/dryrun.mjs` end to end on the live domain (thread)

### Joe on day 6

- [ ] Make a fine-grained GitHub token with read-only access to public repositories, and give it to the 6B thread
- [ ] Test judge mode and check-in in Expo Go on the iPhone: scan a QR from a second phone or a laptop screen

If day 6 runs short, the agenda, countdown and judge mode are the must-haves; QR check-in and GitHub move to Later.

## Decisions for Joe

Threads start on the recommended answer unless Joe says otherwise, and switch if Joe picks another.

| # | Decision | Recommended | What it changes |
| --- | --- | --- | --- |
| D1 | Email copies of group messages (4B), not just inbox and push? | Yes for every audience, sent through the existing results queue. kakushinhub.site now sends to Gmail, so the old reason to hold back is gone | One 4B task |
| D2 | Project gallery (5B): show finalist pitches publicly after results by default, or only when the team opts in? | Opt in: the team lead ticks "Show our project" | Who appears in the gallery |
| D3 | Blind judging (4A): on or off by default for new challenges? | Off by default, one switch per challenge | The default in the challenge editor |
| D4 | Leave multi-round challenges and the impact report for after day 6? | Yes, see Later | Keeps days 4 to 6 to three days |

## Later

Every item from the old "Days 4 to 6 (next plan)" list is in days 4 to 6 above, except these.

- Multi-round challenges (idea round, build round, demo day). It changes how stages, applications and judging connect, so it needs its own plan. Live mode's agenda covers a one-day event
- Impact report with optional demographics. Only gender is stored today, so Joe first decides what to ask and the report shows only groups of 5 or more
- Co-hosts: two organisations running one challenge
- Domain clean-up now that kakushinhub.site is live: once a Gmail sign-in test passes, remove the `RESEND_ONLY_TO` path in `src/lib/email.ts` and its secret. Keep kakushin.dpdns.org pointing at the app, because certificates already issued print it
- iOS universal links for invites, which need the Apple Team ID (from day 3)
