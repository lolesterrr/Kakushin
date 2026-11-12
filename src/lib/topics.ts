// Fixed topic list shared by challenges now and user interests later (Day 6).
export const TOPICS = [
  "fintech", "health", "agritech", "climate", "education", "ai", "energy", "transport", "social-impact",
] as const;
export type Topic = (typeof TOPICS)[number];

export const ORG_TYPES = ["university", "hub", "corporate", "partner", "other"] as const;
export const CHALLENGE_STATUSES = ["draft", "open", "reviewing", "judging", "completed"] as const;

/**
 * Stages only move forward (skipping ahead is fine). Going back, such as completed to open, re-opens things people
 * thought were closed, so it needs an explicit `reopen: true` that the organiser confirms after a warning.
 */
export function stageMoveError(from: string, to: string, reopen: boolean | undefined): string | null {
  const a = CHALLENGE_STATUSES.indexOf(from as (typeof CHALLENGE_STATUSES)[number]);
  const b = CHALLENGE_STATUSES.indexOf(to as (typeof CHALLENGE_STATUSES)[number]);
  if (a < 0 || b >= a || reopen) return null;
  return `Moving from ${from} back to ${to} re-opens the challenge. Confirm the reopen to do it.`;
}
