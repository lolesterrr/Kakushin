-- Day 5A: full challenge pages. Rules, FAQ, sponsors and timeline, a public judges section.

-- Markdown, like description and prizes.
ALTER TABLE challenges ADD COLUMN rules TEXT NOT NULL DEFAULT '';
-- JSON: [{ "q": "...", "a": "..." }]
ALTER TABLE challenges ADD COLUMN faq TEXT NOT NULL DEFAULT '[]';
-- JSON: [{ "name": "...", "logo_key": "sponsors/....png" | null, "url": "https://..." | null }]
ALTER TABLE challenges ADD COLUMN sponsors TEXT NOT NULL DEFAULT '[]';
-- JSON: [{ "label": "...", "at": 1763164800000 }]. The application and pitch dates are added on the page, not stored here.
ALTER TABLE challenges ADD COLUMN timeline TEXT NOT NULL DEFAULT '[]';
-- Judges appear on the public page only when the organiser ticks this, and only those who gave a display name.
ALTER TABLE challenges ADD COLUMN show_judges INTEGER NOT NULL DEFAULT 0;

-- What a judge wants shown on the public page. Set by the judge, per challenge.
ALTER TABLE judges ADD COLUMN display_name TEXT;
ALTER TABLE judges ADD COLUMN title TEXT;
