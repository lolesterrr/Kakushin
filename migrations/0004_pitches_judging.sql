CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  deck_key TEXT,
  deck_name TEXT,
  video_url TEXT NOT NULL DEFAULT '',
  demo_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE criteria (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  weight REAL NOT NULL,
  max_score INTEGER NOT NULL DEFAULT 10,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX criteria_challenge ON criteria(challenge_id, position);

-- Judges are invited by email and do not need an organisation membership.
-- A signed-in user is a judge when their email matches an invite.
CREATE TABLE judges (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_at INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, email)
);

CREATE TABLE scores (
  judge_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (judge_user_id, team_id, criterion_id)
);
CREATE INDEX scores_team ON scores(team_id);
