# DPS experiments — 2026-10-13

## Data and limits

Read the user's local LOA Logs `encounters.db` without modifying it. The full file opened in the browser and
listed 5,835 logs. Soulshan had 24 cleared runs in the Last 2 weeks selection, but only Deskaluda Normal
(encounter 5886, 2026-10-10) supplied usable meter stat values.

**Caveat for that run (from the player):** Soulshan ran it with the water damage card set at only 24 awakening,
not the full set, so the character was below its usual build: roughly CP 6,620 → ~6,300. Treat this run's stat
values, skill shares and hit sample as from that weaker card set (the card bonus differs, which also shifts the
relative worth of other stats a little), not from the 6,620 build bible shows. Skill shares now use this same contributing run,
rather than all 24. A local ignored extract of 120 real Soulshan records supported repeated testing.

The browser loaded Soulshan's current bible snapshot (2026-10-13), weapon +24 and 100 quality. The log predates
the snapshot: this is a model/integration experiment, not proof the historical build exactly matches today's gear.
Older usable meter values exist in July/August. In the six inspected usable clears, +1 pp crit rate ranges from
about +0.122% to +0.546% DPS; build, party and encounter differences prevent treating those as interchangeable.

## Browser experiments

**Historical results:** the combined gem totals below used the initial base-attack calculation. The follow-up
[replay experiment](dps-replay-experiments-2026-10-13.md) found that T4 gem base attack was incorrectly valued
with the accessory Atk. Power % marginal. That bucket error is now corrected; these gem-combination numbers
must not be treated as the current model's outputs. The weapon-only result and skill-effect cross-checks stand.

All figures below are model estimates with the same rotation; cooldown gains assume extra casts according to
measured cooldown use. They are not measured DPS from a second run after an upgrade.

| Change relative to the loaded snapshot | Estimated DPS |
|---|---:|
| Weapon +24 → +25 | +0.94% |
| Vestige damage gem 9 → 10 alone | +0.82% (about +0.64% skill damage plus +0.18% base attack) |
| Weapon +25 and Vestige damage gem 10 | +1.76% |
| Above, plus Astaros cooldown gem 9 → 10 | +2.49% |

Adding an uncovered karma edit retains the covered estimate and labels karma as not included. Most DPS ranks
fully estimated changes ahead of unestimated ones. Each gem appears by skill and kind, instead of CP's grouped
"Lv. 9 → 10" row. All Upgrades displays the same DPS estimates. Imported shares survive component reloads.

## Independent per-hit cross-check

Encounter 5886 has 174 logged hits, accounting for 98.8901% of summed skill damage. Vestige, Gluttony,
Guillotine Swing and Reaper's Scythe each have 100% per-hit coverage. Scaling their actual logged hits by
1.44 / 1.40 (T4 damage gem 9 → 10) produces exactly the same gain as the aggregate skill-share calculation:

| Skill | Damage share | Skill-effect DPS gain |
|---|---:|---:|
| Vestige | 22.2536% | +0.635818% |
| Gluttony | 20.3363% | +0.581038% |
| Guillotine Swing | 11.7545% | +0.335842% |
| Reaper's Scythe | 4.8094% | +0.137410% |

These gains exclude gem base attack. This checks the fixed-rotation damage-gem arithmetic on real hits; it
does not validate cooldown casts, stat linearity, crit caps, or a support-buff-normalized nDPS model.

## Changes driven by the experiments

- Combine stat and gem multipliers; include gem base attack.
- Keep uncovered components visible without discarding covered results.
- Use matching stat/share cohorts, avoid stale asynchronous filter results, and retain imported shares.
- Rank skill-specific gems by DPS and expose estimates in All Upgrades.
- Include bracer flat/percent attack, and within-family bracelet crit/additional-damage rolls whose secondary
  effects stay unchanged. Changes to specialization, speed, unknown effects or bracelet families remain unestimated.
- Add a minimal real-run metric fixture and regressions for combined changes, partial coverage, missing shares,
  successive gem changes, ranking, bracelet rolls and exact gem-slot Apply behavior.

## Next experiments

1. Obtain more recent usable clears of the same raid/gate/difficulty and matching build; report sample spread.
2. Compare marginal stat estimates with a per-hit stat model for large upgrades and crit overcap.
3. Add evolution/conditional effect coverage from numeric game mechanics, with explicit bucket totals.
4. Derive nDPS skill shares and an absolute baseline before displaying projected damage per second.

The database and local extracts remain outside version control; only the small regression metric fixture is
included in source. No changes have been pushed.
