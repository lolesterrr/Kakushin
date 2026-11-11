# 02. Data model

Database: Cloudflare D1 (SQLite). IDs are text (ULIDs or nanoids) so they are safe to show in URLs and sortable by time. Timestamps are Unix milliseconds (integer). Flexible fields (application questions and answers) are JSON text columns.

Every tenant-owned row carries `org_id` (directly or through its challenge), and every query is scoped by it.

## Entity overview

```
users ──< memberships >── organizations ──< challenges
  │                                            │
  │                              ┌─────────────┼──────────────┬───────────────┐
  │                              │             │              │               │
  ├──< team_members >── teams ───┘      criteria        judge_assignments   certificates
  │                       │                │                  │
  │                  applications       scores ───────────────┘
  │                  submissions
  └──< certificates
```

## Tables

### users
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| email | text unique | lowercased |
| name | text | |
| avatar_key | text | R2 key |
| bio | text | |
| institution | text | university, company or hub |
| location | text | |
| skills | text (JSON array) | e.g. ["react","design"] |
| links | text (JSON object) | github, linkedin, portfolio |
| gender | text nullable | optional, for impact reporting later |
| is_platform_admin | integer | 0/1 |
| created_at | integer | |

### sessions
| Column | Type | Notes |
|---|---|---|
| id | text PK | random 32 bytes, stored hashed |
| user_id | text FK | |
| expires_at | integer | 30 days |

### login_tokens
| Column | Type | Notes |
|---|---|---|
| token_hash | text PK | hash of the magic-link token or the 6-digit code |
| kind | text | link (web) or code (mobile) |
| email | text | |
| expires_at | integer | 15 minutes, single use |

### organizations
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| slug | text unique | used in `/o/:slug` |
| name | text | |
| type | text | university, hub, corporate, partner, other |
| logo_key | text | R2 key |
| website | text | |
| plan | text | free, hub, institution, enterprise |
| created_at | integer | |

### memberships
| Column | Type | Notes |
|---|---|---|
| org_id | text FK | |
| user_id | text FK | |
| role | text | owner, admin |
| PK | (org_id, user_id) | |

### challenges
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| org_id | text FK | |
| slug | text | unique per org |
| title | text | |
| summary | text | one line for cards |
| description | text | markdown |
| cover_key | text | R2 key |
| prizes | text | markdown |
| status | text | draft, open, reviewing, judging, completed |
| team_min / team_max | integer | |
| applications_open_at / applications_close_at | integer | |
| pitch_due_at | integer | |
| topics | text (JSON array) | interest topics used for matching alerts |
| questions | text (JSON) | `[{id, label, type, required, options}]` |
| results_published | integer | 0/1 |
| created_at | integer | |

### teams
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| challenge_id | text FK | |
| name | text | |
| invite_code | text unique | 8 chars |
| lead_user_id | text FK | |
| status | text | forming, applied, shortlisted, rejected, finalist, winner |
| placement | integer nullable | 1, 2, 3 for winners |
| created_at | integer | |

### team_members
| Column | Type | Notes |
|---|---|---|
| team_id | text FK | |
| user_id | text FK | |
| joined_at | integer | |
| PK | (team_id, user_id) | |

Rule: a user can only be in one team per challenge (checked in code with a query on challenge_id).

### applications
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| team_id | text FK unique | one application per team |
| answers | text (JSON) | `{questionId: value}` |
| submitted_at | integer | |
| reviewer_note | text | private to organisers |

### submissions
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| team_id | text FK unique | |
| deck_key | text | R2 key (PDF, max 20 MB) |
| video_url | text | YouTube/Drive link |
| demo_url | text | |
| notes | text | |
| updated_at | integer | |

### criteria
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| challenge_id | text FK | |
| name | text | e.g. "Innovation" |
| description | text | |
| weight | real | e.g. 0.3; weights should sum to 1 |
| max_score | integer | default 10 |
| position | integer | display order |

### judges
| Column | Type | Notes |
|---|---|---|
| challenge_id | text FK | |
| user_id | text FK | |
| PK | (challenge_id, user_id) | |

### judge_assignments
| Column | Type | Notes |
|---|---|---|
| challenge_id | text FK | |
| judge_user_id | text FK | |
| team_id | text FK | |
| PK | (judge_user_id, team_id) | default: every judge gets every finalist |

### scores
| Column | Type | Notes |
|---|---|---|
| judge_user_id | text FK | |
| team_id | text FK | |
| criterion_id | text FK | |
| score | integer | 0..max_score |
| comment | text | |
| updated_at | integer | |
| PK | (judge_user_id, team_id, criterion_id) | upsert on save |

### certificates
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| code | text unique | short public code used in `/verify/:code` |
| user_id | text FK | |
| challenge_id | text FK | |
| team_id | text FK | |
| kind | text | participant, finalist, winner |
| title | text | e.g. "1st Place" |
| pdf_key | text | R2 key |
| issued_at | integer | |
| revoked | integer | 0/1 |

### follows
| Column | Type | Notes |
|---|---|---|
| user_id | text FK | |
| org_id | text FK | |
| created_at | integer | |
| PK | (user_id, org_id) | |

### interests
| Column | Type | Notes |
|---|---|---|
| user_id | text FK | |
| topic | text | from a fixed list: fintech, health, agritech, climate, education, ai, ... |
| PK | (user_id, topic) | |

Challenges also get a `topics` column (JSON array from the same list) so matching is a simple lookup.

### announcements
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| org_id | text nullable | null means platform-wide news posted by a platform admin |
| title | text | |
| body | text | markdown |
| link_url | text nullable | |
| created_at | integer | |

### notification_settings
| Column | Type | Notes |
|---|---|---|
| user_id | text PK | |
| in_app | integer | 0/1, default 1 |
| email_digest | text | off, daily, weekly |
| push | integer | 0/1, default 1 |

### push_tokens
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| user_id | text FK | |
| token | text unique | Expo push token, looks like `ExponentPushToken[...]` |
| platform | text | ios, android |
| created_at | integer | |
| last_seen_at | integer | stale tokens are removed when Expo reports them invalid |

### notifications
In-app inbox, also the source for push and email.

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| user_id | text FK | |
| kind | text | application.shortlisted, results.published, certificate.ready, ... |
| title | text | |
| body | text | |
| data | text (JSON) | ids for opening the right screen |
| read_at | integer nullable | |
| created_at | integer | |

### audit_log (cheap and useful for disputes)
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| org_id | text | |
| actor_user_id | text | |
| action | text | e.g. team.shortlisted, score.saved |
| target_id | text | |
| meta | text (JSON) | |
| created_at | integer | |

## Scoring formula

For each team, per judge:

`judge_total = Σ (score / max_score) × weight × 100`

Team result = average of `judge_total` across judges who finished scoring that team. Ties are broken by the highest score on the first criterion, then manually by the organiser.

## Status flow

```
challenge: draft → open → reviewing → judging → completed
team:      forming → applied → shortlisted → finalist → winner
                          └→ rejected
```
