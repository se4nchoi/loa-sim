# Shanzkii public clear observations — 2026-10-14

Read from lostark.bible's public browser UI. The player confirmed all four source links on October 14: Kazeros Hard G1/G2 and Horizon Cathedral Level 3 G1/G2 are the intended validation runs. Local checkout is `dps-sim/v0`.

Sources: [character log list](https://lostark.bible/character/NA/Shanzkii/logs), [Cathedral G1](https://lostark.bible/logs/Nevz2cB), [Cathedral G2](https://lostark.bible/logs/6bHvxtb), [Kazeros G1](https://lostark.bible/logs/4iZPbvC), [Kazeros G2](https://lostark.bible/logs/91Vm5pv).

All four were shown as approximately 11 hours old during inspection. Cathedral G2's localized UI showed October 13 at 22:20 KST. Each player row reports item level 1750.83. Historical loadout links are available; current profile gear must not be substituted without checking those snapshots.

## Displayed results

Numbers are rounded UI observations, not exact exported metrics. Keep raid, gate and difficulty separate.

| Run | Duration | Damage | Normalized damage | DPS | nDPS | Observed crit |
|---|---|---|---|---|---|---|
| Cathedral Level 3 G1 | 7:33 | 402.23b | 159.36b | 887.9m | 351.3m | 86.5% |
| Cathedral Level 3 G2 | 6:49 | 400.48b | 153.20b | 979.2m | 374.4m | 87.5% |
| Kazeros Hard G1 | 4:46 | 159.69b | 59.13b | 558.4m | 206.3m | 90.5% |
| Kazeros Hard G2 | 8:17 | 277.54b | 115.91b | 558.4m | 233.1m | 91.2% |

### Displayed Damage Increase Potential

| Added stat | Cathedral G1 | Cathedral G2 | Kazeros G1 | Kazeros G2 |
|---|---|---|---|---|
| 1% Attack Power | 0.84% | 0.84% | 0.85% | 0.86% |
| 1% Additional Damage | 0.73% | 0.73% | 0.73% | 0.73% |
| 1% Evolution-Type Damage | 0.56% | 0.56% | 0.56% | 0.56% |
| 1% Crit Rate | 0.51% | 0.53% | 0.14% | 0.12% |
| 1% Crit Damage | 0.38% | 0.38% | 0.37% | 0.37% |
| 1% Weapon Power | 0.33% | 0.33% | 0.33% | 0.33% |
| 1,000 Attack Power | 0.43% | 0.43% | 0.42% | 0.43% |
| 1,000 Weapon Power | 0.18% | 0.18% | 0.18% | 0.18% |
| 1,000 Strength | 0.06% | 0.06% | 0.06% | 0.06% |

These percentages belong to the site's own stat calculation. Do not infer the exact denominator from total damage, or manufacture `damageDoneByStat` / `damageDoneByStatPlusValue` pairs from rounded percentages. They are not verified nDPS upgrade gains.

### Main skill observations

| Skill | Cathedral G1 damage share | Cathedral G2 | Kazeros G1 | Kazeros G2 |
|---|---|---|---|---|
| Twelve Forms: Falling Blossoms | 32.1% | 34.3% | 29.4% | 31.2% |
| Twelve Forms: Violent Waves | 15.0% | 13.8% | 13.3% | 12.5% |
| Eye of the Storm | 18.5% | 17.3% | 24.0% | 22.4% |
| Nebula Crusher | 16.1% | 17.3% | 17.8% | 15.1% |
| Celestial Force Barrage | 12.4% | 11.7% | 10.0% | 11.3% |

The UI also exposes per-skill normalized damage, actual/average crit, casts, cooldown utilization and buff contributions. For example, Cathedral G2 Eye of the Storm has 82.4% actual/average crit, while Kazeros G2 has 100% actual/average crit. This is a useful cap-sensitive validation case, but observed crit alone cannot reconstruct uncapped per-hit crit context.

## Local data and next work

The existing database is read-only for this investigation: `C:/Users/user/_se4nchoi/LOA Logs_as_of_1012/LOA Logs/encounters.db`. Its latest Shanzkii rows include Serca encounters 5902/5903 and older Cathedral 5820/5821; the four new public runs are not in that character's latest local rows.

1. Obtain the newer database or an export containing the four confirmed runs' per-hit data.
2. Inspect each run's historical loadout and contribution splits before building an exact regression fixture.
3. Use the public rounded results as external comparison evidence, with tolerance for rounding and meter/version differences.
4. Validate crit caps and shared Twelve Forms gem mapping across Falling Blossoms/Violent Waves; compare raw and normalized shares separately.

## Simulator update

The experimental DPS Sim now offers an explicit Shanzkii-only selector for these four public clears. Applying a clear replaces the character's stat sample and skill shares, retaining one gate at a time. The sample persists in browser storage and feeds the existing marginal stat and gem upgrade estimates.

Only the five main skills tabulated above are included in the public damage shares (92.5–94.5% coverage, depending on the gate); they are not renormalized. Their displayed cooldown-use values are included. Twelve Forms gem shares combine Falling Blossoms and Violent Waves through the existing game-data group mapping. Uncaptured skills remain unknown. This is a manually recorded public sample, not a general lostark.bible log importer.

The UI identifies rounding, a one-run sample, unverified historical gear, and the absence of per-hit replay. Recorded DPS/nDPS are shown as reference values; no absolute projected nDPS is calculated. No original database edits or public uploads were made.

Validation: 24 targeted sample/stat/gem/replay tests pass; Svelte diagnostics report no errors or warnings. Browser checks loaded Shanzkii, applied Kazeros G2, showed +0.86% estimated DPS for weapon +16 to +17, and verified that the chosen public sample and shares survive reload. The weapon result uses the current snapshot with the public marginal values, not a measured upgraded run.
