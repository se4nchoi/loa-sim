# Sample quality and per-hit stat replay — 2026-10-13

## What is implemented

- Import persists dates, exact boss/difficulty, contributing/selected counts, recorded CP and build hash,
  recorded skill gem levels, and a compact real-hit sample. At most 20 newest runs / 3,000 hits are retained
  for replay; the sample panel reports which runs have hits. Metadata covers the contributing cohort. If
  browser storage is full, scalar values, shares and metadata are retried without the hit traces; complete
  traces remain in memory for the current session.
- Sample-quality warnings flag fewer than five runs, mixed encounters/difficulties, old logs, differing
  build hashes, gem mismatches, CP differences above 1%, and poor hit coverage. Matching gems never means
  the complete build is verified. Blunt Thorn activity is identified from its recorded meter contribution.
- Import offers a difficulty filter. Cleared-only requires an explicitly recorded clear.
- Each stat is averaged over its actual valid samples; missing fields no longer dilute an average as zero.
  The UI shows per-stat sample counts and min/max sensitivity. Unsupported fields remain unestimated.
- The replay engine evaluates every actual hit with an explicit stat context. It applies square-root
  main-stat/Weapon-Power scaling, distinct base-attack and outgoing attack-power buckets, support/flat
  attack dilution, additive Additional Damage, crit-damage scaling on actual crits, and expected crit-rate
  scaling with the supplied cap. Hyper Awakening remains fixed for these changes; missing contexts fail
  explicitly. Untracked damage remains fixed. Run gains are averaged equally and their spread is reported.
- The DPS tab has an opt-in replay comparison with editable assumptions. It does not replace meter values,
  change upgrade ranking, or claim support-buff-normalized nDPS.

## Data gap that prevents exact replay

The tested database saves damage, crit flags and buff IDs for each hit, but not the complete per-hit main stat,
Weapon Power, flat attack, multiplier buckets, effective crit multiplier, or uncapped crit rate/cap. The
meter's inspected live contexts are not recoverable from hit damage alone. Observed crit counts cannot reveal
hidden overcap. The engine can consume actual contexts when available, but today's UI supplies snapshot totals
and explicit assumptions. Blunt Thorn's overcap-to-evolution conversion is not implemented.

## Actual-log experiments

Read-only extraction and replay of Soulshan's Deskaluda Normal encounter 5886, dated October 10:
174 hits, 98.890074% damage coverage. Recorded CP is 6389.91015625. The current snapshot loaded in the previous
browser experiment had 6620.18 CP, so the logs cannot be assumed to match its build. Recorded gem levels matched.

For the saved snapshot regression fixture, assume main stat 764,203, Weapon Power 253,611, base attack bonus
12.7%, own flat attack zero, outgoing attack bucket zero, and crit multiplier 2.881413 (the meter's aggregate
all-crits / no-crits ratio, not the multiplier of each hit). These are experiment assumptions.

| Change | No assumed support attack | Constant support attack 26,601.6 | Meter marginal value |
|---|---:|---:|---:|
| +1,000 Weapon Power | +0.194772% | +0.172162% | +0.15901% |
| +1,000 main stat | +0.064680% | +0.057172% | +0.05346% |

Browser comparison for weapon +24 → +25: replay +1.14% with no support addend, +1.01% with the constant
support addend, versus meter +0.94%. Support reduces stat efficiency, but the remaining differences show
that assumptions are not the actual per-hit context.

Assumed crit rate 90%, cap 100%, +1 pp crit produces +0.690807%, far above the meter's +0.14965%. This is
evidence **against** replacing the meter estimate with inferred crit context. At an assumed 110% rate/cap
100%, adding +1 pp produces zero direct crit gain. The engine also tests an 80% cap; it does not convert
overcap to evolution damage. Doubling Weapon Power produces +40.961610% overall gain on these tracked hits,
instead of the approximately +49.445% first-order prediction, showing diminishing returns.

## Correction to earlier gem estimates

The earlier prototype used the meter's `attackPower1percentDamage` for T4 gem base attack. That field changes
the outgoing attack-power-rate bucket, while gems change the base-attack multiplier. Those are distinct.
The current marginal estimate converts a gem base-attack change into added flat attack from the snapshot's
sqrt(main stat × Weapon Power / 6), then uses the meter's flat-attack sensitivity. This remains approximate
because snapshot totals differ from in-fight totals. Replay models the two buckets separately.

Previous +1.76% / +2.49% combined gem figures are superseded by this correction. Skill-effect-only gem gains
remain valid under the fixed-rotation assumption.

## Verification and remaining work

Tests cover real-hit baseline identity and coverage, square-root scaling/diminishing returns, support dilution,
positive/negative crit changes around caps, actual-crit damage changes, distinct attack buckets, missing/invalid
contexts, Hyper Awakening, extraction, mixed samples and build checks. A local temporary browser regression
page exercised the sample panel and editable replay assumptions; it is removed after verification.

Follow-up: the backend now implements [Blunt Thorn conversion](dps-crit-conversion-experiments.md) for supplied
contexts, including saturation and negative changes. Next: obtain actual per-hit stat contexts (or a versioned
runtime reconstruction using inspected stats and buff data), validate against meter outputs on multiple
matching recent runs, and implement other conditional bucket changes. Until then, the replay UI result is a
comparison under assumptions and does not automatically reconstruct Blunt Thorn context.
