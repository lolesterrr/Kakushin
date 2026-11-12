// Fixed topic list shared by challenges now and user interests later (Day 6).
export const TOPICS = [
  "fintech", "health", "agritech", "climate", "education", "ai", "energy", "transport", "social-impact",
] as const;
export type Topic = (typeof TOPICS)[number];

export const ORG_TYPES = ["university", "hub", "corporate", "partner", "other"] as const;
export const CHALLENGE_STATUSES = ["draft", "open", "reviewing", "judging", "completed"] as const;
