-- Day 6A: live mode (agenda, countdown, timed pushes) and QR check-in.

-- The event-day agenda: briefing, ideation, build, pitching and results blocks. Blocks never overlap,
-- so at any moment there is at most one current block.
CREATE TABLE challenge_agenda (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('briefing', 'ideation', 'build', 'pitching', 'results', 'break', 'other')),
  label TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX challenge_agenda_challenge ON challenge_agenda(challenge_id, starts_at);
CREATE INDEX challenge_agenda_starts ON challenge_agenda(starts_at);

-- Timed pushes the 5-minute job already sent, so each goes out once. key is "block:<starts_at>" or "cutoff:<minutes>:<pitch_due_at>":
-- moving a block or the deadline makes a new key, so people hear about the new time.
CREATE TABLE live_alerts (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, key)
);

-- QR check-in for in-person events, off by default. The secret signs each person's pass, so turning
-- check-in off and on again makes every old pass invalid.
ALTER TABLE challenges ADD COLUMN checkin_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenges ADD COLUMN checkin_secret TEXT;

CREATE TABLE check_ins (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checked_in_at INTEGER NOT NULL,
  by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN ('qr', 'name')),
  PRIMARY KEY (challenge_id, user_id)
);
CREATE INDEX check_ins_user ON check_ins(user_id);
