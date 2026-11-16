# Private stats dashboard

Open `/stats` directly and enter the existing `STATS_KEY`. There is no Stats navigation link or public reporting endpoint. The key remains in page memory, is sent only in the authorization header, and is not saved by the application. Authenticated responses remain private and uncached. CSV export is not included.

- Activity: loaded-character estimates, action totals, daily chart, class/region breakdowns, failed loads and share requests.
- Exploration: recommendation/choice/budget sample totals, price coverage, bound-material use, cost assumptions, unpriced reasons and recommendation choices.
- Recorded joint cells: recommendations, single-step offers by ceiling, complete budgets by cost/CP gain, and recommended versus applied categories. A model selector defaults to the corrected CP model; comparisons can be filtered by price coverage. Schema, per-winner assumptions, rank, gain and cost bins remain visible. Older pooled offers and choice pairs are not relabeled as contextual data or counted twice.
- Collection health: received sampling attempts, sampled/excluded totals, reconciliation status and exclusion reasons, separated by model. Diagnostics begin with schema 3; old actions and undelivered events are outside these denominators.
- Saved plans: CP/item-level distributions, plan shape, changed systems, strongest standalone system, weapon/gem targets and crossed milestones.
- Daily tables follow the selected view. A searchable counter inspector shows up to 100 matching recorded fields at a time, including cohort fields not otherwise charted.

All production values come from the existing authenticated stats endpoint. Missing samples show empty states; nothing is backfilled or synthesized. New metrics accumulate only from their deployment onward. The event definitions and limitations are in `stats-insights.md`.

Budget and saved-plan overview histograms are labeled as pooled history. Their joint tables and raw counters retain model-specific context. The historical `cp-2026-10-25` tag spans the Vambraces correction and cannot be repaired retrospectively. Key protection, noindex, header-only authorization and production ingestion behavior are unchanged by this UI release.

## D1 storage

Usage collection and `/api/stats` use the Cloudflare D1 database bound as `STATS_DB` in `wrangler.toml`. Until 2026-11-16 they used Neon, whose free compute is billed for every hour it is awake: each visit's stats batch kept it from sleeping, which used most of the monthly allowance by mid-month. D1 is billed by rows read and written, not by uptime. Neon now holds only shared builds, which wake it rarely.

`STATS_KEY` is a **Secret** on the Cloudflare Pages project (Settings → Variables and Secrets): `wrangler.toml` manages plain variables, so plain ones set in the dashboard never reach the server. Redeploy after changing it. The D1 binding itself comes from `wrangler.toml`; bindings added in the dashboard are ignored while that file exists. Preview deployments do not ingest production events. There is no D1 in `vite dev`, so nothing is recorded locally.

Apply schema changes with `npx wrangler d1 migrations apply STATS_DB --remote` (files in `migrations/d1`). Each browser batch costs one read for retry receipts, then one D1 transaction for the address limiter, the inserts and maintenance. Counters are kept by a trigger that fires only on rows actually inserted, so retries and racing duplicates are never counted twice. Only bounded counter dimensions, validated bucketed samples, hashed character identifiers and event IDs are retained; raw character names and addresses are not stored.

Detailed observations and their retry receipts expire after 90 days; limiter buckets after two minutes. Both are pruned by the first batch of each UTC day. Daily counters and character hashes remain for reporting.

D1's free plan allows 100k rows written per day, and every index entry and deleted row counts. To stay well under it (live traffic was about 15 rows per event on 2026-11-16): events and limiter buckets are `WITHOUT ROWID` tables with no time index (`migrations/d1/0002_lean_writes.sql`), cleanup runs once a day, and from 2026-11-17 the server stores only detailed counters where summaries can be rebuilt from them (`src/lib/stats-compact.ts`). `/api/stats` rebuilds those summaries per day on read, so reports and the Collected counters list are unchanged.

### Neon to D1 copy (2026-11-16)

1. Deploy the D1 code. From then on, stats go only to D1.
2. Run `node --env-file=<private env file> scripts/stats-to-d1.mjs <private out.sql>`. It reads Neon's stats tables without changing them and writes SQL that adds them to D1: events are marked `imported` so the trigger skips them, counters are added to what D1 already recorded, and a `neon-import` marker refuses a second run.
3. Run `npx wrangler d1 execute STATS_DB --remote --file <private out.sql>`, then check `/stats`. Keep the SQL file outside Git.

Done on 2026-11-16 with counters, character days and the exploration date only: the 50,266 raw events were left out (`grep -v '^INSERT INTO loa_stats_events('`), because they would cost about 100k rows written, the free plan's daily limit, and nothing reads them. Counter history before that day matched Neon exactly (295,189).

Neon's stats tables and `loa_stats_ingest` remain as an untouched backup (`migrations/001-stats-postgres.sql`).

### Redis history cutover (October 2026, into Neon; its rows came across in the D1 copy)

1. Deploy the Postgres ingestion change, then let old invocations drain. Stats traffic must no longer write to Redis before the final export.
2. With the existing Redis credentials and Neon connection available only in a private local env file, run `scripts/stats-db.mjs export-redis <private backup.json>`. It reads only known stats keys; shared links are never exported, modified or deleted.
3. Run `scripts/stats-db.mjs import <private backup.json>`. Imports replace the separate historical summary rows transactionally, so rerunning an export/import updates the history without double counting it. Keep the backup outside Git. Existing Redis keys stay intact.
4. Verify the private dashboard and a shared link. Keep the Redis integration until the historical summaries are imported and legacy links have migrated or expired.

The export includes daily HLL estimates and each historical date-range union estimate. These remain estimates. Summing the imported range estimate and new Postgres distinct characters can count a character on both sides of the cutover; the dashboard flags mixed historical reports. Counter totals preserve the original model tags and dimensions, with no invented raw events or backfilled samples.
