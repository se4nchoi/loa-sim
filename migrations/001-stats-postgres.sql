-- Anonymous simulator observations. All schema changes are additive and rerunnable.
CREATE TABLE IF NOT EXISTS loa_stats_events (
  id text PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  day date NOT NULL,
  character_hash text NOT NULL DEFAULT '',
  fields text[] NOT NULL,
  sample jsonb,
  sampling jsonb,
  version integer NOT NULL,
  exploration boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS loa_stats_events_time ON loa_stats_events (occurred_at);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS loa_stats_counters (
  day date NOT NULL, field text NOT NULL, value bigint NOT NULL CHECK (value >= 0),
  PRIMARY KEY(day, field)
);
CREATE TABLE IF NOT EXISTS loa_stats_characters (
  day date NOT NULL, character_hash text NOT NULL, PRIMARY KEY(day, character_hash)
);
CREATE TABLE IF NOT EXISTS loa_stats_rates (
  subject_hash text NOT NULL, bucket timestamptz NOT NULL, hits integer NOT NULL,
  PRIMARY KEY(subject_hash, bucket)
);
CREATE INDEX IF NOT EXISTS loa_stats_rates_time ON loa_stats_rates(bucket);
CREATE TABLE IF NOT EXISTS loa_stats_meta (key text PRIMARY KEY, value text NOT NULL);
-- Imported Redis summaries stay separate, so rerunning the import cannot double counts.
CREATE TABLE IF NOT EXISTS loa_stats_legacy_days (
  day date PRIMARY KEY, counts jsonb NOT NULL, characters bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS loa_stats_legacy_ranges (
  first_day date NOT NULL, last_day date NOT NULL, characters bigint NOT NULL,
  PRIMARY KEY(first_day, last_day)
);
-- statement-breakpoint
CREATE OR REPLACE FUNCTION loa_stats_ingest(batch jsonb, rate_key text, at_time timestamptz)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  pending jsonb;
  needed integer;
  used integer;
  accepted jsonb;
  cleanup_due boolean;
BEGIN
  IF jsonb_typeof(batch) <> 'array' OR jsonb_array_length(batch) NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'Invalid stats batch';
  END IF;
  -- Serialize each address's limiter. Duplicate retries consume no allowance.
  IF rate_key IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('loa_stats:' || rate_key, 0)); END IF;
  SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO pending FROM (
    SELECT DISTINCT ON (e->>'id') e FROM jsonb_array_elements(batch) e
    WHERE NOT EXISTS (SELECT 1 FROM loa_stats_events old WHERE old.id = e->>'id')
  ) unique_events;
  needed := jsonb_array_length(pending);
  IF needed = 0 THEN RETURN 'accepted'; END IF;
  IF rate_key IS NOT NULL THEN
    INSERT INTO loa_stats_rates(subject_hash, bucket, hits)
    VALUES(rate_key, date_trunc('minute', at_time), needed)
    ON CONFLICT(subject_hash, bucket) DO UPDATE SET hits = least(121, loa_stats_rates.hits + EXCLUDED.hits)
    RETURNING hits INTO used;
    IF used > 120 THEN RETURN 'limited'; END IF;
  END IF;
  WITH inserted AS (
    INSERT INTO loa_stats_events(id, occurred_at, day, character_hash, fields, sample, sampling, version, exploration)
    SELECT e->>'id', (e->>'at')::timestamptz, (e->>'day')::date, e->>'character',
      ARRAY(SELECT jsonb_array_elements_text(e->'fields')), nullif(e->'sample','null'::jsonb),
      nullif(e->'sampling','null'::jsonb), (e->>'version')::integer, (e->>'exploration')::boolean
    FROM jsonb_array_elements(pending) e ON CONFLICT(id) DO NOTHING RETURNING *
  ) SELECT coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb) INTO accepted FROM inserted;
  INSERT INTO loa_stats_counters(day, field, value)
    SELECT (e->>'day')::date, f, count(*) FROM jsonb_array_elements(accepted) e,
      jsonb_array_elements_text(e->'fields') f GROUP BY 1, 2
    ORDER BY 1, 2
    ON CONFLICT(day, field) DO UPDATE SET value = loa_stats_counters.value + EXCLUDED.value;
  INSERT INTO loa_stats_characters(day, character_hash)
    SELECT DISTINCT (e->>'day')::date, e->>'character_hash' FROM jsonb_array_elements(accepted) e
    WHERE e->>'character_hash' <> '' ON CONFLICT DO NOTHING;
  INSERT INTO loa_stats_meta(key, value)
    SELECT 'exploration-since', min(e->>'day') FROM jsonb_array_elements(accepted) e
    WHERE (e->>'exploration')::boolean HAVING count(*) > 0
    ON CONFLICT(key) DO UPDATE SET value = least(loa_stats_meta.value, EXCLUDED.value);
  -- Keep summaries, but bound detailed observations to 90 days and limiter buckets to two minutes.
  INSERT INTO loa_stats_meta(key,value) VALUES('cleanup-day', (at_time AT TIME ZONE 'UTC')::date::text)
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value WHERE loa_stats_meta.value < EXCLUDED.value
    RETURNING true INTO cleanup_due;
  IF cleanup_due THEN
    DELETE FROM loa_stats_events WHERE occurred_at < at_time - interval '90 days';
    DELETE FROM loa_stats_rates WHERE bucket < at_time - interval '2 minutes';
  END IF;
  RETURN 'accepted';
END $$;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION loa_stats_report(first_day date, last_day date)
RETURNS jsonb LANGUAGE sql STABLE AS $$
WITH combined AS (
  SELECT day, field, value FROM loa_stats_counters WHERE day BETWEEN first_day AND last_day
  UNION ALL
  SELECT day, field, value::bigint FROM loa_stats_legacy_days, jsonb_each_text(counts) AS counter(field,value)
    WHERE day BETWEEN first_day AND last_day
), counts AS (SELECT day, field, sum(value) AS value FROM combined GROUP BY day, field),
characters AS (
  SELECT day, count(*) AS value FROM loa_stats_characters WHERE day BETWEEN first_day AND last_day GROUP BY day
  UNION ALL SELECT day, characters FROM loa_stats_legacy_days WHERE day BETWEEN first_day AND last_day
), legacy AS (
  SELECT min(day) AS first, max(day) AS last FROM loa_stats_legacy_days WHERE day BETWEEN first_day AND last_day
)
SELECT jsonb_build_object(
  'counts', coalesce((SELECT jsonb_agg(to_jsonb(counts)) FROM counts),'[]'::jsonb),
  'characters', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT day,sum(value) AS value FROM characters GROUP BY day) c),'[]'::jsonb),
  'distinct', (SELECT count(DISTINCT character_hash) FROM loa_stats_characters WHERE day BETWEEN first_day AND last_day)
    + coalesce((SELECT characters FROM loa_stats_legacy_ranges,legacy WHERE first_day=legacy.first AND last_day=legacy.last),0),
  'legacy', EXISTS(SELECT 1 FROM loa_stats_legacy_days WHERE day BETWEEN first_day AND last_day),
  'since', (SELECT value FROM loa_stats_meta WHERE key='exploration-since')
);
$$;
