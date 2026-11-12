-- Day 5: certificates, in-app notifications, follows and topic interests.

CREATE TABLE certificates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('participant','finalist','winner')),
  title TEXT NOT NULL,
  recipient_name TEXT,          -- frozen the first time the PDF is made
  pdf_key TEXT,
  issued_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, challenge_id)
);
CREATE INDEX certificates_challenge ON certificates(challenge_id);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, org_id)
);

CREATE TABLE interests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  PRIMARY KEY (user_id, topic)
);

-- Followers are told about a challenge once, the first time it is published.
ALTER TABLE challenges ADD COLUMN announced INTEGER NOT NULL DEFAULT 0;
UPDATE challenges SET announced = 1 WHERE status != 'draft';
