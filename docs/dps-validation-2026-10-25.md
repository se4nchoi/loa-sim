# DPS / support sim validation — 2026-10-25

Run with `src/lib/dev/dps-backtest.ts` (dev only, browser console on the dev server) against copies of the user's own
LOA Logs `encounters.db`: Soulshan (Souleater, 198 runs, 73 gear snapshots) and Brushann (Artist, the newest 120 of 562
runs, 105 snapshots). Party members of every class in the same logs were used for the per-class checks.

## What was checked

| Check | Result |
|---|---|
| Logged skill ids known to the game data, per class (all 30 classes in the logs) | 96–100% of each class's damage; the rest is bleed and battle items |
| Order core damage lines the meter reads, per class | see the per-class table in the 10-25 session; Souleater 5 unread (2 cores it doesn't run) |
| Core states / Destiny buffs found in the logs | 2 real name mismatches, fixed (Valkyrie "Destiny: Final" = "Destiny: Final Words"; Wildsoul Phantom Beast Awakening = "Phantom Beast Spirit"); the rest unseen only because nobody ran those cores |
| Support buff kinds, all four support classes (≈350 support runs) | attack ≈37%, damage 27–30%, brand ≈16% valued; "other" 17–19% is the support's own effects (corrected 10-26, below) |
| Each run's own setup replayed with the current gear (what DPS mode does) | see "Coverage on real runs" |
| Pairs of runs on different gear: predicted vs measured damage per hit | see "Backtest" |

## Coverage on real runs

Soulshan, each run's snapshot → current loadout:

- Before: 110 of 198 runs dropped every stat edit: LOA Logs saved no stat values on them (many raid runs, not only
  solo; `damageDoneByStat` 0). After lending (`statValueRuns`: same snapshot, else same Order cores within 14 days,
  else the nearest within 30 days, named in a note): 12 of 198.
- A bracelet's plain stat lines (Crit Damage +10%, Additional Damage +4% at the accessory indexes) dropped the whole
  stat part; now read as stats.
- Left as "not counted", correctly: Order core swaps (63 runs, another rotation), bracelet conditional parts
  (Specialization, vs. Demons, Skill cooldown).

Brushann (support meter), 118 runs with a snapshot: only "Engravings" (real legendary book progress since; support
engravings don't feed the valued buffs), "Gem cooldowns" (their base attack counts) and "Other astrogem options".

## Backtest

Consecutive runs of one boss and difficulty, the earlier replayed with the later run's gear, compared with the measured
damage-per-hit change on the skills both used ≥ 20 hits:

- Run-to-run noise is ±10–20% per pair on the same gear (support uptime, raid buffs, crits, positioning), against
  predicted gear changes mostly under 1%. One pair can't validate a small edit; only large changes or many pairs can.
- The one recurring large prediction (+7.6% on the late-July bracelet swap) was wrong and led to the bracelet stat
  line fix above (now +1.7%; that pair also swapped all three Order cores, which the meter notes).

## Kept as decided

- Hyper Awakening hits keep their recorded damage; only Leap Karma moves them (`ultimate_awakening_damage_rate` is
  their only bucket, per the damage formula in `dps-from-logs-plan.md`).
- Run-dependent effects stay unvalued: per-stack bonuses, cooldown-for-damage trades, skill-tree conditions, summons /
  DoTs, timed buffs, Order core swaps, Paradise orb swaps, Evolution Karma.
- Sorceress "Casting Control" = her Casting-type skills is a best match, not confirmed by any source.

## Correction (10-26): the support "other" bucket

It isn't raid buffs. Looked up by buff id in the logs (Brushann, Artist, newest runs): Dance of Passion II is an Ark
Passive party buff (9.4% of her buff damage), Pray is her bracelet (1.5%, already scaled by `gearDebuffFactor`),
Strength / Flash Orb are abilities LOA Logs credits to her (2.1%), 608243000 is Echoing Brand (0.3%, scaled). So
"Party DPS added" (LOA Logs' rDPS given) rightly includes it; only the labels said "not moved by gear" / "raid buffs".

## Bracelet conditions audit (10-27)

- Added 72 boss-name species classifications, generated from LOA Logs' extracted game
  [Npc.json](https://github.com/snoww/loa-logs/blob/master/src-tauri/meter-data/Npc.json). Highest raid grade per name
  excludes lower-grade copies; conflicts and missing species stay unknown. The meter checks every listed phase in a
  gate, with the explicit assumption that scalable damage hits its listed bosses, not adds.
- Regression cases: Serca, Corvus and Belgardin are non-Demon gates; Brelshaza is Demon; Abyss Lord Kazeros is
  Archdemon. Kazeros G2 mixes Archdemon and god; Aegir G1 mixes Demon and ancient. Neither gets a whole-run race.
- Maxroll `engraving[11041]` gives Additional Damage as stat 50 and species damage as 126/136. Its `cardSets`
  (e.g. Tortoyk the Giant) also use 126. This is why changing the species bonus needs the existing card-book total.
  No card-book controls added, per the user. Recorded damage is preserved; only inactive bonuses on known non-Demon
  gates are resolved. Other changed species bonuses remain explicitly uncounted. Unchanged species bonuses cancel.
- Upstream [on_stagger_change](https://github.com/snoww/loa-logs/blob/master/src-tauri/src/live/encounter_state.rs)
  is commented out and records gauge progress in its legacy body. It does not provide a staggered damage window.
  [NpcWindowDamageMetrics](https://github.com/snoww/loa-logs/blob/master/src-tauri/src/models/encounter.rs) and
  [its hit accumulation](https://github.com/snoww/loa-logs/blob/master/src-tauri/src/live/rdps.rs) provide aggregate
  contribution pairs, not per-skill damage under stagger. Stagger bonuses remain uncounted; no time-share proxy.
- 40 targeted tests pass across the meter, stat parser and race classifier. Svelte/TypeScript: no errors or warnings;
  production build passes (existing chunk-size warning remains).
  These are deterministic regression checks; no new real-run backtest or full active species/stagger valuation is claimed.

## Order core assumptions (10-27)

The cached Maxroll items/skills/stats feed first rebuilt the previous catalog identically (all 3,780 option arrays
and 2,160 core definitions). The revised parser adds 38 damage lines and explicitly marks two existing max-stack
threshold bonuses: 40 assumed effects in 38 options across 17 classes. Every formerly valued effect is retained,
compared by option id and effect contents, allowing only the new assumption metadata. Core definitions are unchanged.

Stack caps must be explicit and unambiguous in the option. Per-stack amounts are multiplied by the cap once; a
threshold bonus is not multiplied. Selected timed/next-use bonuses assume they are always ready. Named targets,
exclusions and feature-level replacement are preserved. Existing logged windows (e.g. Footsteps of the Dead) remain
recorded. New assumptions do not add casts or simulate a new rotation.

Counts below use the game's class keys. Each class has 126 options. "Valued" means at least one parsed damage/crit
effect; "fully parsed" means no text effects remain, including non-damage effects. Neither means a whole class or
rotation is validated. All other classes' counts are unchanged.

| Class key | Options with valued effects, before → after | Fully parsed options, before → after | Assumed effects |
|---|---:|---:|---:|
| berserker | 103 → 105 | 81 → 81 | 2 |
| warlord | 112 → 113 | 96 → 96 | 1 |
| arcana | 77 → 79 | 72 → 72 | 2 |
| infighter | 110 → 111 | 91 → 91 | 1 |
| forcemaster | 107 → 107 | 84 → 84 | 1 |
| blade | 113 → 117 | 96 → 98 | 4 |
| reaper | 111 → 112 | 89 → 92 | 3 |
| demonic | 111 → 113 | 87 → 87 | 2 |
| hawkeye | 108 → 109 | 89 → 89 | 1 |
| devilhunter | 115 → 116 | 90 → 90 | 1 |
| blaster | 108 → 112 | 90 → 90 | 4 |
| lancemaster | 117 → 118 | 102 → 102 | 1 |
| scouter | 106 → 114 | 92 → 92 | 8 |
| devilhunter_female | 116 → 117 | 92 → 92 | 1 |
| battlemaster_male | 107 → 109 | 95 → 95 | 2 |
| dragonknight | 106 → 108 | 85 → 85 | 2 |
| dimensionmaster | 107 → 107 | 80 → 80 | 4 |
| **All 30 classes** | **2,922 → 2,955** | **2,433 → 2,438** | **40** |

Regression examples: Power Drive 20% × 3 → 22% × 3 gives `1.66 / 1.60` on Overdrive; SMG Agent 9% × 5 → 10% × 5
gives `1.50 / 1.45` on Annihilation Mode. Eternal Blood's old 7% Sinister line is replaced, not multiplied again.
Art Master's next-use bonuses affect only its three named skills. Point thresholds and unrelated skills are checked.
True Aim's unstated stack cap, cooldown/skill-tree trades and forced Back Attacks remain uncounted.

818 tests pass across 87 files; one opt-in audit is skipped. Svelte/TypeScript: zero errors/warnings. Production build
passes with the existing chunk-size warning. No new live-run backtest was performed; these are model-assumption and
catalog-regression checks.

## Automatic Additional Damage (10-27)

[Gear-context validation](dps-gear-context-2026-10-27.md): reconstructed baseline Additional Damage from matching
gear snapshots, passives and equipped cards, with Master at 5 stacks and pet +1% stated as assumptions. Against
63 runs' own +1 pp Additional Damage values, mean absolute relative error is 0.0520%, maximum 0.1851%.
25 runs' differing-build snapshots are excluded. No fitted parameters or full-context promotion.

At this first checkpoint, this bucket worked without borrowing; attack, crit and evolution still needed the old model.
Also fixed historical weapon quality inheriting today's CP quality and chaos-core variants being ignored in
damage-stat reads. 834 default-suite tests pass, two opt-in audits skipped; the reconstruction audit was run
explicitly. Type checks and production build pass.

## Other automatic stat buckets and stopping boundary (10-27)

Continued through AP%, root/flat attack, Evolution, primary Crit Damage and Crit Rate. Full source links, formulas,
guards and blocked inputs are in [the gear-context report](dps-gear-context-2026-10-27.md).

| Independent marginal | Recovered | Compared with own measured value | Mean absolute relative error | Maximum |
|---|---:|---:|---:|---:|
| Additional Damage | 71 of 96 cached-snapshot runs | 63 | 0.0520% | 0.1851% |
| Soul Eater Atk. Power % with complete hit traces | 23 of 96 | 22 | 0.2776% | 0.4836% |
| Uniform Evolution from efficiency record | 197 of 198 extracted runs | 88 | 0.00002274% | 0.00003736% |

Evolution's pair is maximum/actual **bonus contribution**; dividing the maximum by the selected conversion cap
and ordinary damage recovers the marginal without a crit/speed distribution. One damage-denominator mismatch is
rejected; 109 accepted runs lack the ordinary stat measurement. No new Evolution editing UI was added.

AP requires complete damage/crit traces and known buff levels/stacks. It uses per-skill actual intersections rather
than uptime-product guesses. Shared runs keep only bounded coefficients, not these buff windows. Other classes,
mixed variable-bucket edits and incomplete traces retain the fallback. Explicit totals/own measurements win.

Formula fixes: support addends precede the AP% multiplier; vambrace Basic flat AP precedes the base multiplier.
Configured contexts, replay, deltas and the measured fallback now distinguish Basic flat from accessory flat AP.

No automatic root/flat attack or crit fallback was enabled. Historical support strength, cast-time skill effects
and uncapped crit distribution are missing. The rejected primary-CD prototype still had roughly 7.1% maximum
relative marginal error. It was removed from the audit rather than fitted to the meter.

Final checks: **858 tests passed**, two opt-in audits skipped in the default suite. The cached gear-context audit
also passed explicitly with the final guards. Svelte/TypeScript: zero errors/warnings. Production build passes;
the existing large-chunk and adapter-auto environment notices remain.
