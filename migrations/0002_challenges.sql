CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cover_key TEXT,
  prizes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','reviewing','judging','completed')),
  team_min INTEGER NOT NULL DEFAULT 1,
  team_max INTEGER NOT NULL DEFAULT 4,
  applications_open_at INTEGER,
  applications_close_at INTEGER,
  pitch_due_at INTEGER,
  topics TEXT NOT NULL DEFAULT '[]',
  questions TEXT NOT NULL DEFAULT '[]',
  results_published INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, slug)
);
CREATE INDEX challenges_status ON challenges(status, applications_close_at);
CREATE INDEX memberships_user ON memberships(user_id);
