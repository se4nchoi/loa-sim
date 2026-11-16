-- Anonymous simulator observations in Cloudflare D1 (SQLite). Apply with
-- `npx wrangler d1 migrations apply STATS_DB --remote`. Neon keeps only shared builds.
CREATE TABLE IF NOT EXISTS loa_stats_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL CHECK (julianday(occurred_at) IS NOT NULL),
  day TEXT NOT NULL CHECK (date(day) IS day),
  character_hash TEXT NOT NULL DEFAULT '',
  fields TEXT NOT NULL CHECK (json_valid(fields) AND json_type(fields) = 'array'),
  sample TEXT,
  sampling TEXT,
  version INTEGER NOT NULL,
  exploration INTEGER NOT NULL DEFAULT 0,
  -- Rows copied from Neon already have their counters; the trigger below skips them.
  imported INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS loa_stats_events_time ON loa_stats_events (occurred_at);
CREATE TABLE IF NOT EXISTS loa_stats_counters (
  day TEXT NOT NULL, field TEXT NOT NULL, value INTEGER NOT NULL CHECK (value >= 0),
  PRIMARY KEY (day, field)
);
CREATE TABLE IF NOT EXISTS loa_stats_characters (
  day TEXT NOT NULL, character_hash TEXT NOT NULL, PRIMARY KEY (day, character_hash)
);
CREATE TABLE IF NOT EXISTS loa_stats_rates (
  subject_hash TEXT NOT NULL, bucket TEXT NOT NULL, hits INTEGER NOT NULL,
  PRIMARY KEY (subject_hash, bucket)
);
CREATE INDEX IF NOT EXISTS loa_stats_rates_time ON loa_stats_rates (bucket);
CREATE TABLE IF NOT EXISTS loa_stats_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Imported Redis summaries stay separate, so rerunning the import cannot double counts.
CREATE TABLE IF NOT EXISTS loa_stats_legacy_days (
  day TEXT PRIMARY KEY, counts TEXT NOT NULL CHECK (json_valid(counts)), characters INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS loa_stats_legacy_ranges (
  first_day TEXT NOT NULL, last_day TEXT NOT NULL, characters INTEGER NOT NULL,
  PRIMARY KEY (first_day, last_day)
);
-- Counters follow actual inserts only, so a retried or concurrently duplicated ID is never counted twice.
CREATE TRIGGER IF NOT EXISTS loa_stats_events_count AFTER INSERT ON loa_stats_events WHEN NEW.imported = 0
BEGIN
  INSERT INTO loa_stats_counters (day, field, value)
    SELECT NEW.day, value, count(*) FROM json_each(NEW.fields) WHERE true GROUP BY value
    ON CONFLICT (day, field) DO UPDATE SET value = value + excluded.value;
  INSERT OR IGNORE INTO loa_stats_characters (day, character_hash)
    SELECT NEW.day, NEW.character_hash WHERE NEW.character_hash <> '';
  INSERT INTO loa_stats_meta (key, value)
    SELECT 'exploration-since', NEW.day WHERE NEW.exploration
    ON CONFLICT (key) DO UPDATE SET value = min(value, excluded.value);
END;
