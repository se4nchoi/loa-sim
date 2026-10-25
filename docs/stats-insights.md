# Simulator insight collection

Collection-only release: `codex/stats-collection`. The public navigation tab, dashboard, and public reporting endpoint stay on the deferred `codex/stats-tab` preview. The existing private stats page and key-protected API remain in production. Collection starts after deployment. Schema 2, CP model `cp-2026-10-25`. No historical backfill.

## Questions the data can answer

| Question | Observation and denominator | Stored relationship |
| --- | --- | --- |
| What estimated CP gains fit different gold budgets? | Completed budget views, complete pricing only | Model × region × class × role × starting item-level range × gold range × CP-gain range × bound-material use × assumptions |
| What is the best single-step upgrade offered under 100k / 500k / 1m gold? | Visible Per gold views of unedited, consistent starting loadouts | Same cohort × budget ceiling × best affordable category × CP-gain range; partial pricing is marked |
| Which systems are the best observed CP per gold? | Price-covered recommendation samples | Best-value category, coverage and quality-cost assumption |
| Do people choose the highest CP or the best value? | Successful Apply actions with the pre-apply candidate list and selected ranking mode | Cohort × CP/gold mode × chosen category × best/other/unpriced rank × coverage; best-category-to-chosen-category pairs |
| Where do saved-plan gains come from? | New named saves with settled state and a consistent baseline | Changed systems and strongest positive standalone system gain |
| How common are weapon-only plans? | Same eligible saved plans | Unchanged / weapon-only / single-system / mixed; weapon target under +20, +20–24, +25 or Sidereal |
| Which gem targets do people plan? | Saved plans that change gems | Below 9 / level 9 / some level 10 / all level 10 |
| Which item-level thresholds do plans cross? | Eligible saves with known start and target levels | Crossed 10-level milestones from 1700 through 1820; multiple milestones can belong to one plan |
| Where does upgrading become more expensive? | Complete budget observations within comparable cohorts and assumptions | Gold-to-CP joint ranges rather than unrelated marginal histograms |
| How much does bound inventory matter to viewed budgets? | Budget views with a computed material breakdown | None / some / all bound use, or not applicable; no inventory quantities |

## Triggers and sampling

- **Recommendation sample:** a visible Next Upgrades card in Per gold mode, while the starting state is unedited. Intersection visibility excludes the hidden pricing instance. At most one partial-price and one complete-price sample per baseline object per simulator visit, shared across desktop/mobile card instances. These are observations, not unique characters.
- **Decision sample:** built from the pre-Apply list; emitted only if Apply changes state. Tied best scores count as best. CP and gold choices are separate. Core/astrogem RNG upgrades remain unpriced in gold comparisons.
- **Budget sample:** captured once when a budget dialog closes, using its final visible price result. Reopening creates another budget-view observation. Navigation that simply unmounts the dialog is not a completed budget view. Budget observations and named saves are separate populations.
- **Named save:** captured only after a genuinely new save persists. State equality rejects a save that outruns the simulator debounce. Existing settled CP and system deltas are reused; collection adds no CP or honing simulations.
- **Class/region/role:** canonical class ID, character region, scored role, and starting item-level range. No character name, guild, account identity, full loadout, skill distribution, or named-plan title is retained in insight data.

## Price and model rules

1. Unset material prices are not zero-cost purchases. A honing recommendation is eligible for a priced sample only when its selected strategy's bought materials have prices, or a genuine fixed cost exists.
2. Partial, unpriced, RNG-containing, unsupported, or downgrade-containing budgets do not contribute a complete-cost range. Explicit reason flags remain available.
3. Quality's unlimited-Chaos-Stones assumption and assumptions about Karma stones/raid-drop availability are recorded separately from standard-cost findings; combinations are tagged mixed. Do not combine them silently.
4. Costs are estimated average gold from entered/cached prices and the supplied bound inventory. They are not spending, live market verification, or a guarantee that raid drops and every non-gold requirement are available.
5. Budget ceilings describe the best **single step** in an existing candidate list, not a searched combination of upgrades. Partial coverage never establishes a global best-value upgrade.
6. The strongest saved-plan system uses the existing standalone section delta; ties are recorded separately. These deltas are not additive shares of total CP gain and must not be drawn as a contribution pie chart.
7. Role, class, starting range, region, bound use, coverage and model version are available for grouping. They reduce confounding; they do not make a self-selected sample representative of every Lost Ark player.
8. Bump the model tag when CP or cost semantics change, preserve accepted historical model IDs during migration, and compare versions separately. DPS needs its own contract and model tag before these CP-only hooks are adapted to the DPS branch.

## Storage, privacy and reporting

Samples become daily marginal and selected joint counters in Redis. Receipts deduplicate delivery retries; no persistent visitor identity or raw insight-event journal is introduced. Joint cells are generated only when observed, never preallocated as a Cartesian product. Enum validation bounds every dimension and prevents arbitrary keys or private text from becoming retained fields.

Rich cohort cells remain on the owner-key-protected API. This collection-only release adds no public reporting endpoint or navigation tab. The deferred preview has a fixed allowlist of coarse aggregates. Public facts should be curated with their denominator, sample count, date range and assumptions; use at least 20 qualifying observations per displayed cohort as an editorial floor, not a statistical guarantee.

The byte-aware client batcher keeps UTF-8 requests under the 8 KiB ingestion limit. Collection remains memory-only, best effort, disabled in development and excluded from Vercel previews. Stats never block saving, applying an upgrade, or closing a budget.

Richer dimensions increase storage beyond the original simple-counter estimate. Measure populated fields/day, bytes/day and Redis read/write costs before broadening cohorts. A retained event journal and long-term compaction remain the next architecture stage if volume or new questions require them. Aggregates cannot reconstruct dimensions that were never collected.

## Still not collected

- Actual in-game purchases or causal proof that recommendations were followed.
- Later loadout matches to saved plans; this needs an explicit local comparison and its own observation definition.
- Exact accessory effect/grade pairs and price premiums, or individual gem skill targets.
- Explicit Max-button clicks, reset-after-budget behavior, or complete interaction/session histories.
- Multi-upgrade optimization frontiers, DPS gains, failed-run outcomes, or raw raid logs.

These are intentionally distinct from inferred plan shapes and coarse CP/cost observations. Do not present them as already available.
