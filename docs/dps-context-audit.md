# Runtime replay-context audit

Calculation-only continuation, 2026-10-13. No UI redesign or automatic promotion into ranking.

## Added calculation infrastructure

`replay-context.ts` consumes caller-supplied versioned SkillBuff / ArkPassive / Ability / CombatEffect data.
It does not ship those data tables. It decodes supported numeric stat effects into separate replay buckets,
resolves selected passive levels and Blunt Thorn parameters, and reports missing inputs/effects by source.

Buff lookup supports direct IDs and the meter's composed `1,000,000,000 + skill ID + buff ID` form. That sum
can collide. The encounter's recorded `source.skill.id` resolves the raw buff ID; matching recorded names and
unique groups also rejects mismatched definitions. Ambiguity without the recorded source remains an error.

The importer now retains the hit's timestamp, active buff/debuff IDs, build spec, selected passive levels,
meter version, and compact recorded buff-source metadata. It does not retain the full description tables.

Known unchanged multipliers and non-damage effects can cancel for the supported same-hit stat deltas.
Shield-type effects with numeric crit/attack modifiers are still processed; they are not blindly discarded.
Conditional effects cancel only when the supplied combat-effect definition contains recognized unchanged
damage/skill-execution actions. Unknown actions remain unresolved. These cancellations assume the original
hit conditions and rotation stay fixed; they do not calculate nDPS or changes to those effects themselves.

Crit damage now preserves its **primary additive bucket** separately from the full crit multiplier. With a
primary +100% crit-damage bucket and a separate 1.2× multiplier, adding +10 pp gives 2.1 × 1.2 = 2.52×,
not 2.4 + 0.1 = 2.5×. Both the context decoder and replay engine apply that distinction when the primary
bucket is supplied; the UI's aggregate-multiplier assumption remains approximate.

A complete context is returned only when the caller provides a matching inspected static baseline and all
relevant decoded sources are resolved. The baseline must exclude the active buffs and selected passive
contributions applied by this decoder to prevent double counting. A current snapshot with matching gem
levels is not accepted automatically as the inspected baseline of a historical run.

## Audit against actual encounter 5886

Read the user's installed runtime tables and database without modifying them. The run is Soulshan / Full Moon
Harvester, Deskaluda Normal, meter 1.51.2, with 174 recorded hits.

- Selected passive data and the runtime tables resolve Blunt Thorn's 80% threshold, 1.5× conversion, and
  60 pp conversion maximum.
- The supported decoded sources yield partial crit additions ranging from 34% to 93.65% across hits and
  53% known unconverted evolution additions. These are **partial modifiers, not full character stat totals**.
- Blind composed-ID indexing was ambiguous on 171 hits (94.25% of tracked damage). Supplying the actual
  recorded source skills removes these ID ambiguities from this audit.
- Buff-level information remains required on 157 hits (98.05% of tracked damage). Presence alone does not
  identify a selected level when a buff has multiple numeric levels.
- Stack counts remain required on every hit, including Adrenaline. Repeated IDs are deduplicated, not
  interpreted as stack counts. Shared unique groups have unverified stacking behavior.
- Other outstanding inputs include the matching inspected baseline, level-specific Crit-point scaling,
  speed-related conversions, class/skill features, and some conditional/passive effects.

**0 of 174 hits have a fully verified reconstructed context from the currently supplied inputs.** This is an
input/provenance finding, not zero effect or a zero-DPS prediction. Resolved partial modifiers are useful
for the next reconstruction stage but cannot safely replace the meter's calculations.

## Verification

Regression tests cover actual recorded-source ID arithmetic, collision resolution, version mismatches,
matched-baseline requirements, numeric stack counts, support caster attack and buff levels, primary crit
damage, passive-level conversion, missing/conditional effects, non-damage cancellation and preserved trace
metadata. No absent level, stack count or inspected stat is silently filled from a typical build.

The updated real-run fixture contains recorded hit/source/build metadata, not the installed game's tables.
Local audit reports and bundled runner scripts stay in ignored `cache/`.

## Next calculation work

Add dependency-specific reconstruction so sources irrelevant to a particular stat change do not block it.
Then resolve class/skill feature scope using supplied runtime definitions and obtain a matching inspected
baseline. Validate each projection against the saved meter marginals before allowing replay-based ranking.

## Dependency-specific continuation

The decoder now accepts an optional `delta` and returns the buckets required by that change in
`dependencies`. Without `delta`, it retains the complete-context audit. Attack-stat changes require
main stat, Weapon Power, flat/support attack and base attack; outgoing attack %, additional damage and
crit damage use their own buckets. Crit-rate/evolution changes keep the coupled crit, crit-damage and
evolution dependencies for conversion builds.

Known unrelated buff sources can be excluded before requiring their level, stacks or caster attack.
Every possible numeric level is checked before excluding a source. Unknown IDs, unresolved effects,
ambiguous definitions and missing matching baseline provenance still block the projection. This does
not infer absent historical stats or mark a current snapshot as matching encounter 5886.

Use `replayAuditedHitRatio` for a projected audit: it rejects a delta requiring buckets outside the
audited projection. The raw context is not a complete reconstructed character context. The replay UI
and rankings remain unchanged.

Synthetic regressions verify additional-damage replay with unrelated missing crit/support inputs,
required support dilution for Weapon Power, unknown-effect blocking, mixed level dependencies, baseline
provenance and rejection of incompatible delta reuse. Actual-run marginal validation still awaits a
matching inspected baseline and the user's versioned runtime tables; neither is present in this workspace.

## Per-encounter validation harness

`validateReplayMarginals` checks eight supported stat increments against the meter's recorded values for
one identified encounter. It refuses aggregate/mismatched cohorts, absent samples, incomplete projections,
unresolved contexts and insufficient hit coverage. Each result is `match`, `mismatch` or `unavailable`,
with the replay value, meter value, difference in percentage points and deduplicated input issues. Default
numeric tolerance is 0.02 percentage points and minimum hit coverage is 95%; both are caller-controlled.
A numerical match is a cross-check, not proof that historical context provenance or all upgrades are correct.

Tests cover bucket arithmetic, measured zero versus missing data, invalid thresholds and old Deskaluda
assumption mismatches. No validation output is used to rank upgrades automatically.

Shanzkii's current NA bible snapshot was fetched for inspection (male Scrapper, recorded CP 4312.59).
No encounter database or runtime meter-data tables are available in this workspace, so Shanzkii's sample
counts and meter/replay agreement have not been checked. Its current snapshot cannot establish historical
buff totals, card setup or matching encounter provenance.

Remaining completeness requirements:
- Matching historical inspected stats, cards/build and versioned runtime tables for real-run validation.
- Per-hit stacks, buff levels and skill/class conditional scope for the relevant changed buckets.
- Multiple matching encounters to evaluate accuracy and stability beyond a single marginal increment.
- Conditional engraving, Ark Grid, specialization/speed and rotation-changing upgrade models.
- Support-buff-normalized skill shares and baseline before displaying absolute projected nDPS.
