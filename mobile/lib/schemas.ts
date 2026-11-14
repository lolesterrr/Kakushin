import { z } from "zod";

// Shapes of the Worker's JSON that the app relies on. Parsing here turns a surprise
// from the server into a readable error instead of a crash deep inside a screen.
export const org = z.object({ slug: z.string(), name: z.string(), logo_url: z.string().nullable().optional() });

export const challengeCard = z.object({
  slug: z.string(), title: z.string(), summary: z.string(), cover_url: z.string().nullable().optional(), topics: z.array(z.string()),
  team_min: z.number(), team_max: z.number(), status: z.string().optional(), prize: z.string().optional().nullable(),
  applications_close_at: z.number().nullable(), org,
});
export type ChallengeCard = z.infer<typeof challengeCard>;
export const challengeList = z.object({ challenges: z.array(challengeCard), next: z.string().nullable().optional() });

export const question = z.object({
  id: z.string(), label: z.string(), type: z.enum(["short_text", "long_text", "choice", "url"]),
  required: z.boolean(), options: z.array(z.string()).default([]),
});
export type Question = z.infer<typeof question>;

export const challengeDetail = z.object({
  challenge: challengeCard.extend({
    description: z.string(), prizes: z.string(), status: z.string(),
    applications_open_at: z.number().nullable(), pitch_due_at: z.number().nullable(),
    questions: z.array(question), results_published: z.number().optional(),
    criteria: z.array(z.object({ name: z.string(), description: z.string(), weight: z.number(), max_score: z.number() })).default([]),
    // Day 5: full challenge pages. Optional so the app still reads an older server.
    rules: z.string().default(""),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    timeline: z.array(z.object({ label: z.string(), at: z.number() })).default([]),
    sponsors: z.array(z.object({ name: z.string(), url: z.string().nullable().optional(), logo_url: z.string().nullable().optional() })).default([]),
    judges: z.array(z.object({ name: z.string(), title: z.string() })).default([]),
    // Day 6: the event-day agenda, and whether check-in passes exist.
    agenda: z.array(z.object({ id: z.string(), kind: z.string(), label: z.string(), starts_at: z.number(), ends_at: z.number() })).default([]),
    checkin_enabled: z.boolean().default(false),
  }),
  role: z.string().nullable().optional(),
  saved: z.boolean().optional(),
});
export type ChallengeDetail = z.infer<typeof challengeDetail>["challenge"];

export const team = z.object({
  id: z.string(), name: z.string(), status: z.string(), placement: z.number().nullable().optional(), invite_code: z.string(), is_lead: z.boolean(),
  members: z.array(z.object({ id: z.string(), name: z.string(), is_lead: z.boolean(), avatar_url: z.string().nullable().optional() })),
  application: z.object({ answers: z.record(z.string()), submitted_at: z.number() }).nullable(),
});
export type Team = z.infer<typeof team>;
export const teamResponse = z.object({ team: team.nullable() });

export const myTeams = z.object({
  teams: z.array(z.object({
    id: z.string(), name: z.string(), status: z.string(), title: z.string(), cslug: z.string(), oslug: z.string(), oname: z.string(),
    placement: z.number().nullable().optional(), cstatus: z.string().optional(), logo_url: z.string().nullable().optional(),
    applications_close_at: z.number().nullable().optional(), pitch_due_at: z.number().nullable().optional(), has_pitch: z.boolean().optional(),
  })),
});

export const me = z.object({
  user: z.object({
    id: z.string(), email: z.string(), name: z.string().nullable(), bio: z.string().nullable(), institution: z.string().nullable(),
    location: z.string().nullable(), skills: z.array(z.string()),
    // Day 8: pictures and the public profile. Optional so the app still reads an older server.
    avatar_url: z.string().nullable().optional(), banner_url: z.string().nullable().optional(),
    handle: z.string().nullable().optional(), public_profile: z.boolean().optional(),
  }).nullable(),
});
export type Me = NonNullable<z.infer<typeof me>["user"]>;

export const certificates = z.object({
  certificates: z.array(z.object({ code: z.string(), kind: z.string(), title: z.string(), challenge: z.string(), org: z.string(), issued_at: z.number(), link: z.string().optional() })),
});

export const inbox = z.object({
  items: z.array(z.object({ id: z.string(), kind: z.string(), title: z.string(), body: z.string(), link: z.string(), read_at: z.number().nullable(), created_at: z.number() })),
  unread: z.number(),
  next: z.string().nullable().optional(),
});
export type InboxItem = z.infer<typeof inbox>["items"][number];

export const follows = z.object({ orgs: z.array(z.object({ slug: z.string(), name: z.string() })), topics: z.array(z.string()) });
export const topics = z.object({ topics: z.array(z.string()) });

export const pitch = z.object({
  pitch: z.object({
    has_deck: z.boolean(), deck_name: z.string().nullable(), video_url: z.string(), demo_url: z.string(), repo_url: z.string().default(""), notes: z.string(), updated_at: z.number(),
    video_embed: z.string().nullable().optional(),
  }).nullable(),
  images: z.array(z.object({ id: z.string(), url: z.string(), caption: z.string() })).default([]),
  max_images: z.number().default(6),
  due: z.number().nullable(),
  open: z.boolean(),
});
export type Pitch = z.infer<typeof pitch>;

export const orgDetail = z.object({
  org: z.object({ slug: z.string(), name: z.string(), type: z.string().nullable().optional(), website: z.string().nullable().optional(), logo_url: z.string().nullable().optional(), verified: z.union([z.boolean(), z.number()]).optional() }).passthrough(),
  challenges: z.array(challengeCard.extend({ results_published: z.number().optional() })),
});

export const publicResults = z.object({
  published: z.boolean(),
  winners: z.array(z.object({ placement: z.number().nullable(), team: z.string(), members: z.string() })),
  finalists: z.array(z.string()),
});

export const invitePreview = z.object({
  team: z.object({ name: z.string(), status: z.string(), title: z.string(), cslug: z.string(), oslug: z.string(), oname: z.string(), team_max: z.number(), size: z.number(), logo_url: z.string().nullable().optional() }),
});

// ---- Day 6: live mode, check-in and judging ----
export const block = z.object({ id: z.string(), kind: z.string(), label: z.string(), starts_at: z.number(), ends_at: z.number() });
export type Block = z.infer<typeof block>;
export const live = z.object({
  now: z.number(),
  challenge: z.object({ title: z.string(), slug: z.string(), status: z.string(), pitch_due_at: z.number().nullable(), checkin_enabled: z.boolean(), org: z.object({ slug: z.string(), name: z.string() }) }),
  agenda: z.array(block),
  messages: z.array(z.object({ id: z.string(), title: z.string(), body: z.string(), created_at: z.number() })),
  me: z.object({ role: z.string().nullable(), team: z.object({ id: z.string(), name: z.string(), status: z.string() }).nullable(), checked_in_at: z.number().nullable() }).nullable(),
});
export const checkinPass = z.object({ enabled: z.boolean(), code: z.string().nullable(), name: z.string().optional(), team: z.string().optional(), checked_in_at: z.number().nullable() });
export const checkinList = z.object({
  enabled: z.boolean(), total: z.number(), checked_in: z.number(),
  people: z.array(z.object({ user_id: z.string(), name: z.string(), team: z.string(), checked_in_at: z.number().nullable(), method: z.string().nullable() })),
});
export const checkinResult = z.object({ already: z.boolean(), name: z.string(), team: z.string(), checked_in_at: z.number(), checked_in: z.number() });

export const judgeChallenges = z.object({ challenges: z.array(z.object({ slug: z.string(), title: z.string(), status: z.string(), oslug: z.string(), oname: z.string(), teams: z.number() })) });
export const criterion = z.object({ id: z.string(), name: z.string(), description: z.string().default(""), weight: z.number(), max_score: z.number() });
export type Criterion = z.infer<typeof criterion>;
export const judgeChallenge = z.object({
  challenge: z.object({ title: z.string(), status: z.string(), org: z.string(), scoring_open: z.boolean(), blind: z.boolean().optional(), round: z.string().nullable().optional() }),
  criteria: z.array(criterion),
  teams: z.array(z.object({ id: z.string(), name: z.string(), has_pitch: z.boolean(), own_team: z.boolean(), done: z.boolean(), partial: z.boolean() })),
});
export const judgeTeam = z.object({
  team: z.object({ id: z.string(), name: z.string(), members: z.array(z.object({ name: z.string(), institution: z.string().nullable() })) }),
  blind: z.boolean(),
  pitch: z.object({ has_deck: z.boolean(), deck_name: z.string().nullable(), video_url: z.string(), video_embed: z.string().nullable().optional(), demo_url: z.string(), repo_url: z.string().default(""), notes: z.string() }).nullable(),
  images: z.array(z.object({ id: z.string(), url: z.string(), caption: z.string() })).default([]),
  scores: z.array(z.object({ criterion_id: z.string(), score: z.number(), comment: z.string().nullable() })),
  own_team: z.boolean(), scoring_open: z.boolean(), criteria: z.array(criterion),
});
export const repoStats = z.object({
  status: z.string(), blind: z.boolean().optional(), not_on_team: z.number().optional(),
  contributors: z.array(z.object({ login: z.string().nullable(), member: z.string().nullable(), on_team: z.boolean(), commits: z.number() })).optional(),
  no_commits: z.union([z.number(), z.array(z.object({ name: z.string(), linked: z.boolean() }))]).optional(),
});

// ---- Day 8: project pages and the event recap ----
export const projectCard = z.object({
  id: z.string(), team: z.string(), status: z.string(), placement: z.number().nullable(), challenge: z.string(), cslug: z.string(), oslug: z.string(),
  video_url: z.string().default(""), video_embed: z.string().nullable().optional(), demo_url: z.string().default(""), repo_url: z.string().default(""),
  notes: z.string().default(""), cover_url: z.string().nullable().optional(), members: z.string().default(""),
});
export type ProjectCard = z.infer<typeof projectCard>;
export const gallery = z.object({ projects: z.array(projectCard) });
export const project = z.object({
  project: projectCard.omit({ members: true }).extend({
    members: z.array(z.object({ name: z.string(), handle: z.string().nullable(), avatar_url: z.string().nullable().optional(), lead: z.boolean() })),
    images: z.array(z.object({ id: z.string(), url: z.string(), caption: z.string() })),
  }),
  org: z.object({ slug: z.string(), name: z.string() }),
  more: z.array(projectCard),
});
export const photos = z.object({
  photos: z.array(z.object({ id: z.string(), url: z.string(), caption: z.string(), approved: z.boolean(), by: z.string(), created_at: z.number() })),
  can_add: z.boolean(), can_manage: z.boolean(), open: z.boolean(), per_person: z.number(),
});

// ---- Day 9: global events (listed from outside Kakushin), saved items ----
export const eventCard = z.object({
  slug: z.string(), title: z.string(), summary: z.string().default(""), image_url: z.string().nullable().optional(), topics: z.array(z.string()).default([]),
  organizer: z.string().default(""), location: z.string().default(""), is_online: z.boolean().default(false),
  starts_at: z.number().nullable(), ends_at: z.number().nullable(), deadline_at: z.number().nullable(),
  source: z.string().default(""), host: z.string().default(""), over: z.boolean().optional(),
});
export type EventCard = z.infer<typeof eventCard>;
export const eventList = z.object({ events: z.array(eventCard), next: z.string().nullable().optional() });
export const eventDetail = z.object({
  event: eventCard.extend({ description: z.string().default(""), url: z.string(), state: z.string(), over: z.boolean().default(false) }),
  saved: z.boolean().default(false),
});
export const savedList = z.object({ challenges: z.array(challengeCard.extend({ results_published: z.number().nullable().optional() })), events: z.array(eventCard) });
export const myEvents = z.object({ events: z.array(eventCard.extend({ state: z.string(), review_note: z.string().default("") })) });
