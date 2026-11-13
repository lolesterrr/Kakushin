-- Day 6B: a GitHub repo on each pitch, and a one-hour cache of what GitHub says about it.

ALTER TABLE submissions ADD COLUMN repo_url TEXT NOT NULL DEFAULT '';

-- Contributors and commit counts per repo ("owner/name", lower case), so judges opening the same team
-- do not spend the GitHub allowance (60 calls an hour without a token).
CREATE TABLE github_cache (
  repo TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
