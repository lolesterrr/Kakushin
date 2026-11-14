-- Day 7: multi-round challenges (for example idea round, build round, demo day).
-- A challenge with no round names keeps working as one round, exactly as before.

-- The round names in order, as a JSON array, and which one judges are scoring now (1 is the first).
ALTER TABLE challenges ADD COLUMN round_names TEXT NOT NULL DEFAULT '[]';
ALTER TABLE challenges ADD COLUMN current_round INTEGER NOT NULL DEFAULT 1;

-- The furthest round a team reached. Judges see finalists whose round_reached is at least the current round.
ALTER TABLE teams ADD COLUMN round_reached INTEGER NOT NULL DEFAULT 1;

-- Each round has its own pitch rubric, so its scores never mix with an earlier round's.
ALTER TABLE criteria ADD COLUMN round_no INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS criteria_stage;
CREATE INDEX criteria_stage ON criteria(challenge_id, stage, round_no, position);
