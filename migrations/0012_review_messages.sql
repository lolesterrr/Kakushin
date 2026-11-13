-- Day 4B: an application rubric, reviewer scores, and group messages to the people in a challenge.

-- Criteria now belong to a stage. Everything that exists is the pitch rubric judges use.
ALTER TABLE criteria ADD COLUMN stage TEXT NOT NULL DEFAULT 'pitch' CHECK (stage IN ('application', 'pitch'));
CREATE INDEX criteria_stage ON criteria(challenge_id, stage, position);

-- Organisation admins score applications against the application rubric.
CREATE TABLE application_scores (
  reviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (reviewer_user_id, team_id, criterion_id)
);
CREATE INDEX application_scores_team ON application_scores(team_id);

-- Group messages live with announcements. challenge_id is null for follower announcements and platform news.
ALTER TABLE announcements ADD COLUMN challenge_id TEXT REFERENCES challenges(id) ON DELETE CASCADE;
ALTER TABLE announcements ADD COLUMN audience TEXT;
CREATE INDEX announcements_challenge ON announcements(challenge_id, created_at DESC);
