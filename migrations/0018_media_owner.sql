-- Platform owner: the one account that decides who else is a platform admin.
-- Other platform admins can review challenges and suspend people, but never touch the owner
-- and never hand out or take away the admin role.
ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;
-- The first platform admin ever made becomes the owner. Change it later with:
--   UPDATE users SET is_super_admin = 1 WHERE email = 'you@example.com';
UPDATE users SET is_super_admin = 1, is_platform_admin = 1
  WHERE id = (SELECT id FROM users WHERE is_platform_admin = 1 ORDER BY created_at, id LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM users WHERE is_super_admin = 1);

-- Screenshots on a pitch, in the order the team chose. All optional: a pitch with none works as before.
CREATE TABLE pitch_images (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX pitch_images_team ON pitch_images(team_id, position);

-- Event photos for a challenge's recap. Organisers' photos are approved at once;
-- participants' photos wait for an organiser.
CREATE TABLE challenge_photos (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  key TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX challenge_photos_ch ON challenge_photos(challenge_id, approved, created_at);
