-- Day 7: announcements, push tokens, notification settings, organisation admin invites.

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,   -- null means platform news
  author_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  recipients INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX announcements_org ON announcements(org_id, created_at DESC);

CREATE TABLE push_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'ios',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX push_tokens_user ON push_tokens(user_id);

CREATE TABLE notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE notifications ADD COLUMN pushed_at INTEGER;
-- Everything that exists now was never pushed and should not be.
UPDATE notifications SET pushed_at = created_at;

CREATE TABLE org_invites (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  invited_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, email)
);
