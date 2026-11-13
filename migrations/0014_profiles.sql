-- Day 5B: Explore search, public profiles, the project gallery and the team finder.

-- Public profiles live at /u/:handle and are off until the person turns them on.
ALTER TABLE users ADD COLUMN handle TEXT;
ALTER TABLE users ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX users_handle ON users(handle) WHERE handle IS NOT NULL;

-- Project gallery: a finalist or winning team appears only when its lead ticks "Show our project" (decision D2).
ALTER TABLE teams ADD COLUMN show_project INTEGER NOT NULL DEFAULT 0;

-- Past winners are listed newest first. Older results count from when the challenge was created.
ALTER TABLE challenges ADD COLUMN results_published_at INTEGER;
UPDATE challenges SET results_published_at = created_at WHERE results_published = 1;

-- Team finder: people on an open challenge who are looking for a team.
CREATE TABLE team_seekers (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, user_id)
);
CREATE INDEX team_seekers_user ON team_seekers(user_id);

-- Invites a team lead sent from the team finder, so one person is not invited twice by the same team.
CREATE TABLE team_finder_invites (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_finder_invites_user ON team_finder_invites(user_id);
