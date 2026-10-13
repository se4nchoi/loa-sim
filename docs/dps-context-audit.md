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
