CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  lead_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'forming' CHECK (status IN ('forming','applied','shortlisted','rejected','finalist','winner')),
  placement INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX teams_challenge ON teams(challenge_id, status);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_members_user ON team_members(user_id);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  answers TEXT NOT NULL DEFAULT '{}',
  submitted_at INTEGER NOT NULL,
  reviewer_note TEXT NOT NULL DEFAULT ''
);
