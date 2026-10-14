# DPS scope, absolute results and rotation timing — 2026-10-14

## Product objectives

The raid scope is the top-level input to DPS Sim. Simulator owns snapshot selection, gear edits and CP visualizations. DPS Sim reads those saved inputs and answers: what would this plan do to the selected encounter(s)?

**Primary objective, clarified October 14:** a unified Next Upgrades comparison across CP gain, estimated DPS gain, upgrade cost, gold per 1% CP and gold per 1% DPS. Defer Sim Score. Absolute DPS before/after and the percent change summarize the current saved plan; upgrade comparisons are the main decision interface. Timing experiments and charts are secondary work.

### Unified Next Upgrades

Below the raid scope and current-plan result, display the same candidate upgrades in one comparable table:

| Upgrade | CP gain | Estimated DPS gain | Expected cost | Gold / 1% CP | Gold / 1% DPS |
|---|---|---|---|---|---|
| One exact legal step | percent | percent or unestimated | same cost basis | cost / CP gain | cost / DPS gain |

Sort choices: Most CP, Most DPS, Best gold / CP, Best gold / DPS. Preserve individual skill gems in both comparisons; do not compare grouped CP gem rows with differently defined DPS upgrades. Show both metrics for the same candidate, same current plan, same raid scope and same price assumptions. Missing DPS coverage or prices remain unknown, never zero or free. Nonpositive gains do not receive a beneficial gold-efficiency rank.

The current-plan headline compares the starting snapshot with all saved changes. A Next Upgrades row compares the current saved plan with that plan plus one candidate. Recompute marginal gains and costs after the plan changes; do not mix gains measured against those two different baselines. All candidates use the existing upgrade application and CP simulation routines rather than reimplementing their mechanics. Gear editing remains in Simulator, with a contextual link from a candidate to that page.

Use the existing gold price, material inventory, honing strategy and book assumptions for both rankings. Price an upgrade once; display that same cost in each efficiency column. Gold / 1% uses the numerical percent (e.g. cost / 3.5 for a 3.5% gain). Plan-wide cost should be recalculated using shared material availability and combined changes rather than summing hypothetical mutually exclusive candidate prices.

For cohorts, estimate baseline and target damage separately per run before producing the aggregate candidate gain. Show contributing runs and coverage for each candidate, and compare ranks on a common cohort; a gain based on one covered run must not silently rank beside a gain based on every selected run as equivalent evidence.

### Selection order

1. Character and log source (database or public sample).
2. Scope: specific clear, same-gate cohort, or character database overview.
3. Raid, difficulty, gate(s), run/date range and inclusion filters as appropriate to scope.
4. Saved Simulator baseline and target plan.

The raid scope bar precedes the estimate and stays visible while scrolling. Its summary repeats beside the result, e.g. `Kazeros · Hard · G2 · Oct 13 · 8:17 · 1 clear`, or `Cathedral · Level 3 · G2 · 6 clears · Oct 1–14`. Changing scope updates every result panel and clears stale asynchronous results immediately.

Specific clear: choose a gate clear with date/time, duration and build status. Optionally select both gates from the same raid session; retain separate gate results and show a duration-weighted session summary. Do not concatenate them into one continuous combat timeline. Pairing gates uses explicit selection or verified session metadata, not just their shared raid name.

Same-gate cohort: constrain raid, gate and difficulty; expose date range, cleared-only default and build compatibility. Show all contributing runs and exclusions. Samples with missing metric/upgrade coverage do not silently join a projection based on a different cohort.

Database overview: analyze each included character run separately before aggregation. Group the results by raid/gate/difficulty and show covered versus excluded runs. Label any overall value `Mixed-raid overview`; never imply it represents one raid, or average different raids' stat sensitivities into a universal build weight. The headline is a summary of that chosen database workload, not a portable character DPS rating.

## Result layout

After scope and Simulator plan selection, show a meter-style comparison:

| Metric | Starting snapshot | Simulated plan | Difference |
|---|---|---|---|
| DPS | absolute value | projected value | absolute and percent |
| Total damage | total | projected total | absolute and percent |
| Duration | recorded duration | same duration by default | held fixed |

Use observed total DPS as the initial metric. Offer nDPS only when the selected cohort has valid attribution and the counterfactual model supports the corresponding metric. Unavailable values stay unavailable. Normalize no DPS metric by CP percent.

The desired summary is `100.0m recorded DPS → 103.5m estimated DPS · +3.5% with your saved changes`, for a model whose +3.5% is the whole-run gain on that metric. This is an illustrative example, not a Shanzkii measurement. The duration, baseline/build provenance and covered changes must be consistent; stat-specific marginals are not automatically whole-run gains. No Sim Score is needed.

Below the headline: cumulative damage baseline/target chart, optional rolling-DPS chart with a labeled window, per-skill damage/casts/delta table, saved changes, coverage and assumptions. For cohorts, show a distribution and per-run comparisons rather than a fabricated average timeline. For multiple gates, show gate-specific results.

### Baseline provenance

The recorded log's build and the loaded Simulator baseline can differ. Validate historical snapshot/gems/build first. If they match, the log is the measured baseline. If they differ and covered transformations can be calculated, show three stages: recorded clear → estimated starting snapshot → estimated plan. If the transformation is not supported, block a full absolute projection or label the covered portion explicitly; a raw public marginal applied to arbitrary current gear is not a measured baseline.

Public Shanzkii samples are rounded observations. Their stat percentages may use a stat-specific eligible-damage denominator. Do not blindly multiply whole-run DPS by the current aggregate marginal estimate. Preserve fixed, untracked and special damage separately and reconstruct eligible damage before presenting full absolute DPS.

### Aggregation

For a selected metric and exact contributing cohort:

- Baseline DPS = sum(baseline damage_i) / sum(duration_i).
- Target DPS = sum(target damage_i) / sum(duration_i), with the same durations.
- Gain = target DPS / baseline DPS - 1.

Per-run gains and their range are also visible. Never use an unweighted average of per-run DPS or gains as if it were this duration-weighted headline. Baseline and target use identical runs; excluded runs and reasons are reported. Preserve per-run metric versions, attribution options and build provenance.

## Faster rotation: model requirements

Moving existing hits earlier, while retaining all damage and the same fight duration, changes the curve but leaves whole-run DPS unchanged. Faster cycles can raise whole-run DPS by adding casts/partial bursts before encounter end or downtime, improving a buff/vulnerability overlap, or retaining damage before death/interruption. They can also lose beneficial overlaps.

In an ideal uninterrupted cycle with unchanged damage, 20 seconds → 19 seconds gives 20/19 - 1 = approximately 5.26% more cycle throughput. This is not an automatic 5.26% whole-raid gain: unaffected damage, cooldown/resource dependencies, fixed burst duration, mechanics, invulnerability and finite encounter boundaries constrain it.

For Shanzkii, the timing experiment should model a declared meter-generation segment and its following burst. The user supplies a `meter filling time saved per cycle` assumption first; deriving that saving from particular gear requires verified cooldown, speed, specialization, identity gain and animation rules.

Preserve cycle boundaries, cast grouping and hit offsets. Shorten only the specified eligible filling segment. Recompute the earliest legal burst using resource availability, required filler skills, burst duration, cooldown readiness, action occupancy and downtime constraints. Savings accumulate only while those dependencies permit them; scheduled waits or phase resets can absorb or reset them. Do not shift every hit left by N seconds or create damage in an invulnerable phase.

The model needs two explicit policies: preserve recorded waits/phase alignment, or use eligible saved time immediately. Show both as assumption-based scenarios, not statistically guaranteed lower/upper bounds. The default encounter duration and boss timeline remain fixed; predicting earlier kills requires a separate party and phase-progression model.

Shifted hits must be evaluated against buffs, debuffs and vulnerability at their new time. Recorded per-hit buff IDs cannot simply travel with a shifted hit. Own effects that follow casts and party effects on the encounter clock require separate treatment. Missing durations, stacks, gauge telemetry or effect values make exact reconstruction unavailable. A normalized-damage timing scenario can reduce external-buff dependence, but still needs correct caps, resource dependencies and model provenance.

Do not count a cooldown upgrade twice through the existing extra-cast approximation and a new timeline simulation. Report fixed-rotation stat/skill damage effects separately from timing effects and then combine through one calculation of target hit damage and target casts.

## Current evidence and gaps

The current importer `replay-data.ts` retains hit timestamps but flattens cast groups and discards their timestamps. It also drops per-hit attribution fields. It limits retained traces to 20 newest contributing runs and 3,000 hits; that partial replay cohort cannot stand in for all selected runs in an absolute overview.

Read-only inspection of local Shanzkii encounter 5903 found 394 cast records and 896 hits. Casts contain `timestamp`, `last`, `hits`; hits contain `timestamp`, `damage`, `unbuffedDamage`, `rdpsDamageReceived`, `rdpsDamageReceivedSupport`, crit/direction flags and buff IDs. `unbuffedDamage` was zero throughout the inspected hits despite nonzero entity-level totals, so field presence alone is not usable metric coverage. Validate party-attribution sums and missing-hit residuals against stored player totals before deriving a normalized timeline.

LOA Logs documents cast breakdowns and opener rotation views in its [official README](https://github.com/snoww/loa-logs/blob/master/README.md). Its [encounter implementation](https://github.com/snoww/loa-logs/blob/master/src-tauri/src/live/encounter_state.rs) retains timestamped skill events and party-damage attribution. Those are evidence inputs, not an automatic counterfactual simulator.

## Implementation order

1. Top-level scope selection, run inventory, contributing/excluded cohorts and visible raid identity.
2. Preserve player totals/metric provenance and cast/hit attribution; verify original totals and timelines against logs. Retain necessary traces per selected run or stream calculations for large databases.
3. Fixed-duration absolute baseline/target damage and DPS, with matched historical baseline and explicit partial coverage.
4. Unified Next Upgrades: same candidates, CP and DPS marginal gains, shared costs, and separate gold-efficiency rankings.
5. Per-skill meter comparison and cumulative damage chart, with per-run views for cohorts and overview.
6. Shanzkii timing experiment using user-supplied segment savings; expose assumptions and added casts/bursts.
7. Derive rotation savings from supported gear changes only after the class/resource/cooldown mechanics are validated.

Verification includes unchanged-state reproduction, phase lock absorbing all savings, accumulating savings fitting an extra burst, no effect for a one-time shift with fixed total damage, changed buff overlap, separate gate timelines, duration-weighted cohort arithmetic, missing-hit residuals, mismatched builds, stale filter results and prevention of duplicate cooldown benefits.
