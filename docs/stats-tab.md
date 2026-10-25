# Stats tab: first implementation

Branch: `codex/stats-tab`, based on `origin/main`. The DPS branch is independent.

Public dashboard release is deferred until enough data is collected. Production receives the collection-only changes on `codex/stats-collection`; the new navigation tab, dashboard, and public reporting endpoint remain on this preview branch. CSV export has been removed.

## Included

- A public Stats navigation tab that loads automatically without a key. `/api/stats/public` publishes an explicit allowlist of aggregate counters; the original `/api/stats` endpoint retains key-protected diagnostics.
- Activity totals, a switchable line/area chart, searchable/sortable class breakdowns, region breakdowns, two facts derived from existing counters, and expandable daily data/collection definitions.
- Saved plans collect bounded CP-gain and target-item-level ranges plus dealer/support role, reusing the simulator's settled calculations. Stale state, flagged baseline mismatches, and Willpower errors exclude the numeric sample without losing the save count. No historical backfill.
- The Saved plans view shows distributions and sample counts; the most-common-goal fact requires 20 sampled plans.
- An Exploration view for budget opens, successful recommendation applications by category, and successful build import actions. These are new aggregate counters; no historical backfill or full plan records.
- Versioned insight samples capture budget-to-CP relationships, single-step opportunities, recommendation choices, plan shapes, milestones, and model/region/class/role context. See `stats-insights.md` for the precise populations and remaining gaps.
- Class resolution from loadout IDs with header fallback. Missing/unrecognized metadata have separate reason counters. Historical Other remains in the Unknown class display total.
- Successful pasted loads included with a source dimension; remote and pasted loads share the same resolver.
- Visible simulator visits counted once per character per page instance. Earlier tab-level deduplication remains historical data, documented in collection details.
- A bounded memory-only delivery queue: up to 64 waiting events, batches of 16, stable random event IDs, at most three attempts, and Retry-After handling for rate limits.
- Streaming ingestion limited to 8 KiB, batch validation before writes, event-ID requirements on batches, and short-lived address-derived rate limits. Raw addresses are not saved as analytics dimensions.
- Vercel preview/development deployments discard telemetry so shared environment configuration cannot mix their activity into production counters.
- One Redis HTTP pipeline per batch. Each event uses a Lua script to combine counters, character sketch update, and an expiring duplicate receipt. Batch retries reuse receipts, including across UTC midnight.
- Strict ingestion returns a retryable failure when storage is unavailable. Optional server-observed share tracking retains a best-effort wrapper so analytics failure does not fail the product operation.
- Legacy daily hashes/sketches retained. Report reads split REST requests into bounded groups; approximate distinct counts still use sketch unions.

## Deliberate limits

- This is the Redis-based accuracy/dashboard stage of the architecture plan. The PostgreSQL journal, scheduled aggregator, and richer budget/cohort visualizations remain future stages; their selected aggregate data now collects through the insight hooks.
- Share requests retain their original server-loader definition and are labeled accordingly. They are not presented as confirmed human views.
- Client events are reported actions, not proof of a human or an actual game purchase. Memory-only queues cannot guarantee delivery after a tab closes.
- The exploration start date is the first observed new event. Historical totals do not become a reconstructed visit funnel.
- Existing infrastructure storage errors and request-rate limits are signaled by HTTP responses. A durable operations-health history is a later stage.
- Redis duplicate receipts expire after seven days; the browser retry window is much shorter. A future journal replaces this temporary per-event receipt design at larger scale.
- Public responses use a one-minute browser/instance cache and five-minute CDN cache. Supported ranges are limited to four values, and concurrent instance cache misses share one read. Private API responses remain no-store.
- The chart supports hover/touch selection and arrow-key navigation. One observed day remains one point.
- Unit tests exercise storage behavior through a Redis REST test double. The Lua script also requires a real Redis/Upstash integration check before production rollout; no production database is used for tests.

## Validation

Run `npm run check`, `npm test`, and `npm run build` in this worktree. Tests cover class aliases/legacy labels, collection bounds, duplicate deliveries, retry limits, HTTP errors, batch validation, and existing importing/sharing behavior.

The architecture and full rollout checklist are in `stats-tracking-architecture-2026-10-25.md`.
