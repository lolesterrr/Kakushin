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
export const challengeList = z.object({ challenges: z.array(challengeCard) });

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
  }),
});
export type ChallengeDetail = z.infer<typeof challengeDetail>["challenge"];

export const team = z.object({
  id: z.string(), name: z.string(), status: z.string(), invite_code: z.string(), is_lead: z.boolean(),
  members: z.array(z.object({ id: z.string(), name: z.string(), is_lead: z.boolean() })),
  application: z.object({ answers: z.record(z.string()), submitted_at: z.number() }).nullable(),
});
export type Team = z.infer<typeof team>;
export const teamResponse = z.object({ team: team.nullable() });

export const myTeams = z.object({
  teams: z.array(z.object({ id: z.string(), name: z.string(), status: z.string(), title: z.string(), cslug: z.string(), oslug: z.string(), oname: z.string() })),
});

export const me = z.object({
  user: z.object({
    id: z.string(), email: z.string(), name: z.string().nullable(), bio: z.string().nullable(), institution: z.string().nullable(),
    location: z.string().nullable(), skills: z.array(z.string()),
  }).nullable(),
});
export type Me = NonNullable<z.infer<typeof me>["user"]>;

export const certificates = z.object({
  certificates: z.array(z.object({ code: z.string(), kind: z.string(), title: z.string(), challenge: z.string(), org: z.string(), issued_at: z.number() })),
});

export const inbox = z.object({
  items: z.array(z.object({ id: z.string(), kind: z.string(), title: z.string(), body: z.string(), link: z.string(), read_at: z.number().nullable(), created_at: z.number() })),
  unread: z.number(),
});

export const follows = z.object({ orgs: z.array(z.object({ slug: z.string(), name: z.string() })), topics: z.array(z.string()) });
export const topics = z.object({ topics: z.array(z.string()) });
