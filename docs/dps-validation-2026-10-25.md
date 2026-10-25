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
| Support buff kinds, all four support classes (≈350 support runs) | attack ≈37%, damage 27–30%, brand ≈16% valued; "other" 17–19% is raid buffs (Dance of Passion II, Strength / Flash Orb, Lostwind Cliff) the support's gear can't move |
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
