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

## Postgres storage

Usage collection and `/api/stats` use the dedicated Neon database. Configure `STATS_DATABASE_URL` (or the Vercel integration's `STATS_URL`) and the existing `STATS_KEY`. Redis credentials are never a stats fallback. Shared simulations and sharing rate limits also use this Postgres database. Preview deployments do not ingest production events.

Apply the schemas in `migrations/` once before deploying, using `node --env-file=<private env file> scripts/stats-db.mjs migrate`. `verify` checks the connection and schema without writing events. The Neon driver sends parameterized SQL over HTTPS; each browser batch becomes one transactional database function call, including retry receipts and the address limiter. Only bounded counter dimensions, validated bucketed samples, hashed character identifiers and event IDs are retained; raw character names and addresses are not stored. Hashed rate buckets are pruned during maintenance.

Detailed observations and their retry receipts expire after 90 days, with cleanup on the next ingestion after the UTC day changes. Daily counters and character hashes remain for reporting. Expired shared builds and sharing limit buckets are also removed by this daily maintenance; creating a share performs additional bounded cleanup. A shared link is rejected at its expiry even before cleanup runs.

### Redis history cutover

1. Deploy the Postgres ingestion change, then let old invocations drain. Stats traffic must no longer write to Redis before the final export.
2. With the existing Redis credentials and Neon connection available only in a private local env file, run `scripts/stats-db.mjs export-redis <private backup.json>`. It reads only known stats keys; shared links are never exported, modified or deleted.
3. Run `scripts/stats-db.mjs import <private backup.json>`. Imports replace the separate historical summary rows transactionally, so rerunning an export/import updates the history without double counting it. Keep the backup outside Git. Existing Redis keys stay intact.
4. Verify the private dashboard and a shared link. Keep the Redis integration until the historical summaries are imported and legacy links have migrated or expired.

The export includes daily HLL estimates and each historical date-range union estimate. These remain estimates. Summing the imported range estimate and new Postgres distinct characters can count a character on both sides of the cutover; the dashboard flags mixed historical reports. Counter totals preserve the original model tags and dimensions, with no invented raw events or backfilled samples.
