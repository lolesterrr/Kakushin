-- Day 4A: fair judging. Judge assignments, conflict-of-interest flags and blind review.

-- Which judge scores which finalist. A challenge with no rows here keeps the old behaviour: every judge sees every finalist.
CREATE TABLE judge_assignments (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, email, team_id)
);
CREATE INDEX judge_assignments_team ON judge_assignments(team_id);

-- A judge pressed "I know this team". The team leaves their list and auto-assign skips the pair.
CREATE TABLE judge_conflicts (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, email, team_id)
);

-- Blind review hides member names and institutions from judges. Off by default (decision D3).
ALTER TABLE challenges ADD COLUMN blind_judging INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenges ADD COLUMN judges_per_team INTEGER NOT NULL DEFAULT 3;
