-- Platform admin: event approval, verified and suspended organisations, suspended users, audit log.

ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;

ALTER TABLE organizations ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;

-- A challenge waiting for approval stays a draft with review_state = 'pending', so nothing public changes.
ALTER TABLE challenges ADD COLUMN review_state TEXT NOT NULL DEFAULT 'none' CHECK (review_state IN ('none','pending','approved','rejected'));
ALTER TABLE challenges ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
ALTER TABLE challenges ADD COLUMN submitted_at INTEGER;
ALTER TABLE challenges ADD COLUMN approved_at INTEGER;
-- Everything already public counts as approved.
UPDATE challenges SET review_state = 'approved', approved_at = created_at WHERE status != 'draft';

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_log_created ON audit_log(created_at DESC);
