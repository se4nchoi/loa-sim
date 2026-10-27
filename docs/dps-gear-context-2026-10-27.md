# Gear-derived damage context — 2026-10-27

Automatic reconstruction now covers **Additional Damage**, **Soul Eater Atk. Power % with complete buff traces**,
and a **uniform Evolution marginal from passive-efficiency records**. This is not a complete automatic combat
context. Root attack/support and crit still need measured/lent values or explicit configured totals. No automatic
zero-support default or guessed crit-cap distribution was enabled.

## Calculation and integration

`gear-damage-context.ts` reconstructs baseline Additional Damage from weapon quality, accessory and bracelet
lines, chaos/astrogem stats, direct Ark Passive stats, Master and the actual equipped card set. It does not simulate
card-book species bonuses. `scripts/bake-damage-context.mjs` bakes the small stat slices from the same Maxroll cache
as the other game-data scripts.

- Master is assumed at its explicit 5 stacks (8.5 pp Additional Damage). It counts only when taken.
- Pet Additional Damage is assumed +1 pp, matching `PET_SKILL_DAMAGE_RATE` in
  [LOA Logs' stat reconstruction](https://github.com/snoww/loa-logs/blob/master/src-tauri/src/live/player_stats.rs).
  This is an assumption, not a pet stat read from the snapshot; the character must have a pet contribution.
- Both assumptions are named in the existing Limits fold. The per-run note identifies the gear estimate.
- A changed Additional Damage bucket scales by `(100 + baseline + delta) / (100 + baseline)`. Other stat edits
  remain separate. Hyper Awakening and Paradise proc damage do not receive this multiplier.
- Explicit configured totals take priority, then the run's own measured values. Without those, a verified gear
  total replaces borrowing for this bucket alone. Other buckets still use the existing fallback. Missing remaining
  context stays unknown; a mixed edit does not acquire a complete upgrade-ranking number merely because its
  Additional Damage portion is known.
- DPS mode, Next Upgrades and Target DPS share the augmented selected run. Share links carry and validate the
  bounded baseline total, preserving the estimate without another player's local logs or snapshot cache.

Reconstruction is withheld for missing/mismatched passive trees, unknown nodes/levels, incomplete equipment/grid,
unresolved bracelet/engraving Additional Damage, nonempty legacy elixir/transcendence data, missing card/pet data,
or an accessory roll the state cannot represent exactly. Wrong-build snapshots are not treated as valid baselines.

## Real-run comparison

Used a workspace copy of `C:/Users/user/_se4nchoi/encounters.db` (the 10-18 database), never modifying the original.
The newest 198 Soulshan rows with snapshots contain 88 runs with measured stat values. Cached their 25 distinct
gear snapshots through Mathi's approved endpoint; those hashes cover 96 runs in the extract.

| Result | Count |
|---|---:|
| Runs with a reconstructed bucket | 71 |
| Reconstructed runs with a measured Additional Damage marginal | 63 |
| Reconstructed runs without that marginal | 8 |
| Snapshots rejected for differing passive builds | 25 runs |

Compared the predicted gain from **+1 percentage point of Additional Damage** with the run's own
`additionalDamage1percentDamage` pair. Mean absolute relative error: **0.0520%**; maximum: **0.1851%**.
These are marginal-value errors, not absolute DPS errors or an attack/crit validation. The retained fixture is
encounter 5120, with a reconstructed 48.88 pp bucket. No parameters were fitted from the measured values.

The opt-in `src/lib/dev/gear-context.audit.test.ts` reads only ignored local extracts/snapshots and writes
`cache/gear-context-audit.json`. It asserts at least one comparison and a maximum relative error below 3%.
The local extract and full database copy are not repository fixtures.

## Setup corrections found during reconstruction

- `clearState` no longer feeds the character's current weapon-quality CP part into the historical item reader.
  The snapshot's own rolled quality now wins; a quality-50 weapon stays 50 even when today's weapon is 100.
- `gridStats` now reads a chaos core's simulated/historical `variant`, matching the corresponding explicit item id.

## Atk. Power %: gear plus recorded buff intersections

`engraving-damage-stats.ts` reads actual engraving stats at the equipped book/stone level, independently of the
flattened CP engraving table. Adrenaline assumes 6 stacks and Ether Predator 30, as already disclosed in Limits.
Static AP includes equipment, direct passive/card stats and chaos/astrogem lines. Unrepresented AP rolls or
unresolved own-AP passive text prevent reconstruction. Initially enabled only for the validated Soul Eater class.

The importer compacts `skillCastLog[].hits[]` into exact intersections of self buffs. Atropine (+30 pp), Strength
Orb (e.g. +12.8 pp) and endgame contribution (+2 pp) therefore use their actual overlap and damage, not multiplied
uptime percentages. Composed buff ids resolve through encounter buff → source skill metadata. Target debuffs are
not treated as player AP buffs. Game facts come from LOA Logs' extracted
[SkillBuff.json](https://github.com/snoww/loa-logs/blob/master/src-tauri/meter-data/SkillBuff.json) and
[CombatEffect.json](https://github.com/snoww/loa-logs/blob/master/src-tauri/meter-data/CombatEffect.json), baked by
`scripts/bake-combat-stat-buffs.mjs`. Unknown levels/stacks/effects stay unknown.

For each complete skill, fractional gain per +1 pp is `sum(damage / (100 + staticAP + buffAP)) / skillDamage`.
The trace must account for both total and critical damage. No extrapolation of missing hits or skills. The meter
uses these coefficients only for AP-only stat edits (optionally plus static Additional Damage); combined root,
crit, conversion or conditional crit/directional edits require a joint context and stay on the old path. Ark Grid
and engravings must be unchanged. Explicit totals and the run's own stat measurements retain priority. Hyper and
Paradise proc damage stay fixed. Share links carry bounded coefficients, stripping the compact buff windows.

Of 96 cached-snapshot runs, 23 reconstruct AP for every ordinary skill; 22 have the corresponding meter value.
Mean absolute relative marginal error **0.2776%**, maximum **0.4836%**. One otherwise unmeasured run gains this
bucket. Other runs keep the fallback. These results do not validate other classes or all missing-stat runs.

## Evolution: recover the marginal without recovering crit distribution

In upstream [efficiency accumulation](https://github.com/snoww/loa-logs/blob/master/src-tauri/src/live/rdps.rs),
the passive-efficiency pair stores **maximum and actual bonus contributions**, not whole damage with and without
the passive. If the conversion cap is C percentage points, maximum contribution on a hit is `damage*C/(100+E)`.
Consequently `maximumContribution/C/ordinaryDamage*100` is the exact damage-weighted percent gain per +1 pp of
uniform Evolution, with all conversion rules unchanged. It does not identify uncapped crit or movement speed.

`evolution-value.ts` supports selected Blunt Thorn (conversion caps 45/60 pp, excluding its direct 7.5/15 pp) and
Supersonic Breakthrough (12/24 pp). Caps are generated from the game's passive descriptions/direct stats. Missing,
invalid, contradictory or denominator-mismatched records are rejected; no Standing Striker extrapolation.
`runSummary` excludes Hyper/Paradise when checking the denominator and retains only the derived marginal.

Across all **198** extracted runs, **197** yield a value; one mismatched ordinary-damage denominator is rejected.
All **88** measured runs agree: mean absolute relative marginal error **0.00002274%**, max **0.00003736%** (rounding).
**109** accepted runs lack the ordinary measured value. The meter's projection helper supports a uniform Evolution
delta with unchanged conversion, skill weights, cores and conditional multipliers. There is no new passive editor
or Evolution control in this pass, and Evolution Karma still only gives HP/CP. Do not present this as enabling
Blunt Thorn, speed, crit or passive swaps.

## Attack-formula corrections

Checked against [LOA Logs' attack reconstruction](https://github.com/snoww/loa-logs/blob/master/src-tauri/src/live/player_stats.rs):

`attack = ((sqrt(main*weapon/6) + BasicFlat) * (1 + basePct/100) + flat + support) * (1 + APpct/100)`.

- Support additive attack precedes AP%, so it dilutes root-stat gains but does not dilute AP% gains. Fixed the
  configured engine and the measured model's AP inversion/combined root+AP projection accordingly. Borrowing
  another run remains approximate; the correction does not reconstruct its missing support amount.
- Vambrace stat 114 (`base_damage_addend`) precedes the base-attack multiplier. Split `baseAttackFlat` from
  accessory/bracelet flat attack through deltas, configured contexts, replay and measured fallback. The manual
  context defaults now place vambraces there; its saved-input key advances to v2 to avoid reusing old ambiguous
  flat-attack totals. Baseline Basic attack also scales when the base multiplier changes.

## Where the remaining buckets are blocked

| Bucket | Missing information / result |
|---|---|
| Main stat, Weapon Power, flat attack, base attack | Snapshot gives personal stats, but not historical support base attack/buff strength. Buff presence alone cannot supply its additive amount. rDPS attribution is normalized across overlapping effects, not a literal attack share. No support-free automatic default. |
| Primary Crit Damage | A prototype including Soul Drain's Death Grudge and Deathlord-only Fatal Finale bonuses still missed meter marginals by up to about 7.1%. Hit-time identity alone does not establish cast-time conditions or which skill effects/ticks receive a tripod. Prototype removed; no fitted CD fallback. |
| Crit Rate / Blunt Thorn changes | Recorded crits and aggregate efficiency do not determine the uncapped rate distribution or how a larger/negative crit edit crosses thresholds/caps. Existing measured/configured paths remain; no observed-crit-rate substitution. |
| Other classes / incomplete traces | Need a matching snapshot, complete attributable hits and a class-source audit before enabling AP reconstruction. Missing traces require a better export/recorder, not an uptime guess. |

Regression counterexamples cover identical combined crit multipliers with different primary-CD gains, and identical
personal gear with different support amounts producing different root-stat gains. The opt-in audit now checks AD,
AP and Evolution independently against source marginals; it no longer contains the failed CD prototype.

## Verification

The original database and full extracts remain outside committed fixtures. The retained fixture contains only
Soulshan's own gear, compact skill windows and an efficiency pair. New tests cover buff intersections and aliases,
unknown levels/stacks, incomplete traces, correct efficiency-pair semantics, shared-coefficient bounds/privacy,
and attack bucket placement. Final suite/build results are recorded in `dps-validation-2026-10-25.md`.
Existing browser imports remain compatible and keep their fallback. Re-import the logs to populate the new
buff windows and Evolution record; they cannot be reconstructed from the old compact summaries alone.
