-- Fewer D1 rows written per event (free plan: 100k/day). Events and limiter buckets become WITHOUT ROWID tables,
-- so a row is stored once instead of a row plus a primary-key index, and their time indexes go: cleanup now runs
-- once per UTC day, where a scan is cheaper than an index entry on every insert.
CREATE TABLE loa_stats_events_lean (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL CHECK (julianday(occurred_at) IS NOT NULL),
  day TEXT NOT NULL CHECK (date(day) IS day),
  character_hash TEXT NOT NULL DEFAULT '',
  fields TEXT NOT NULL CHECK (json_valid(fields) AND json_type(fields) = 'array'),
  sample TEXT,
  sampling TEXT,
  version INTEGER NOT NULL,
  exploration INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
-- Copied before the trigger exists, so copied rows are not counted again.
INSERT INTO loa_stats_events_lean SELECT id, occurred_at, day, character_hash, fields, sample, sampling, version, exploration, imported
  FROM loa_stats_events;
DROP TABLE loa_stats_events;
ALTER TABLE loa_stats_events_lean RENAME TO loa_stats_events;

CREATE TABLE loa_stats_rates_lean (
  subject_hash TEXT NOT NULL, bucket TEXT NOT NULL, hits INTEGER NOT NULL,
  PRIMARY KEY (subject_hash, bucket)
) WITHOUT ROWID;
INSERT INTO loa_stats_rates_lean SELECT subject_hash, bucket, hits FROM loa_stats_rates;
DROP TABLE loa_stats_rates;
ALTER TABLE loa_stats_rates_lean RENAME TO loa_stats_rates;

-- Same trigger as 0001; dropping the table dropped it.
CREATE TRIGGER loa_stats_events_count AFTER INSERT ON loa_stats_events WHEN NEW.imported = 0
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
