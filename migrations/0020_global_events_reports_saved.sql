-- Day 9: global events (listings from outside Kakushin), reports on events, and saved events.

-- Where global events are read from. Platform admins manage these.
CREATE TABLE external_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('rss','hackclub')),   -- 'rss' also reads Atom feeds
  url TEXT NOT NULL UNIQUE,
  topics TEXT NOT NULL DEFAULT '[]',        -- topics given to every item from this source
  keywords TEXT NOT NULL DEFAULT '',        -- comma-separated; an item must mention one (empty takes everything)
  auto_publish INTEGER NOT NULL DEFAULT 0,  -- 0: items wait in the review queue
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fetched_at INTEGER,
  last_status TEXT NOT NULL DEFAULT '',
  last_added INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- An event that Kakushin lists but does not run. It comes from a source or from someone's suggestion.
CREATE TABLE external_events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  source_id TEXT REFERENCES external_sources(id) ON DELETE SET NULL,
  source_name TEXT NOT NULL DEFAULT '',     -- kept on the row so it survives the source being deleted
  external_key TEXT,                        -- the item's own id inside its source
  submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',     -- plain text
  url TEXT NOT NULL UNIQUE,                 -- the official page; one listing per page
  image_url TEXT,
  organizer TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  is_online INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER,
  ends_at INTEGER,
  deadline_at INTEGER,
  topics TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','published','rejected','removed')),
  review_note TEXT NOT NULL DEFAULT '',
  announced INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX external_events_source_key ON external_events(source_id, external_key) WHERE source_id IS NOT NULL AND external_key IS NOT NULL;
CREATE INDEX external_events_state ON external_events(state, published_at DESC);

-- Bookmarks: a challenge on Kakushin or a global event.
CREATE TABLE saved_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('challenge','event')),
  item_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, item_id)
);
CREATE INDEX saved_items_item ON saved_items(kind, item_id);

-- "Something is wrong with this event", sent by a signed-in person to the platform admins.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('challenge','event')),
  item_id TEXT NOT NULL,
  reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam','scam','offensive','wrong','other')),
  details TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','dismissed','actioned')),
  resolved_by TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX reports_once ON reports(kind, item_id, reporter_user_id);
CREATE INDEX reports_state ON reports(state, created_at);

-- People can switch off notes about new global events without losing the rest.
ALTER TABLE notification_settings ADD COLUMN global_events INTEGER NOT NULL DEFAULT 1;
