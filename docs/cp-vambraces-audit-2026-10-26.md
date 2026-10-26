# Vambraces CP mismatch — 2026-10-26

The deployed site was checked against fresh public character responses for Soulshan, Soulshann, Shanzkii,
Ignishan, Kamehameshaan and Brushann. The player confirmed that Soulshan has separate max-CP and raid setups.

| Dealer setup | Imported breakdown | With missing flat Basic Attack Power | Recorded CP |
| --- | ---: | ---: | ---: |
| Soulshann, merged | 5610.81 | 5676.22 | 5676.22 |
| Shanzkii, current | 4339.96 | 4363.34 | 4363.34 |
| Ignishan, current | 4286.39 | 4309.83 | 4309.83 |
| Kamehameshaan, current, no Vambraces | 3817.03 | 3817.03 | 3817.03 |
| Soulshan, merged raid components | 6958.08 | 7033.07 | 7207.72, max-CP setup |

Vambraces add 850 flat Basic Attack Power at +5 and 2030 at +10, carried in stat 114. The supplied base attack
breakdown uses `sqrt(mainStat × weaponPower / 6) × (1 + baseAttackPct / 100)` and omits that flat contribution.
Adding it inside the parentheses reproduces the three affected dealer scores to the displayed precision.
Soulshan's gemless current snapshot also reproduces its recorded 3109.13 with this correction.

`baselineParts` repairs only a breakdown whose value and base-attack metadata match the identifiable old formula,
with equipped Vambraces and a positive, recorded stat 114. Already-corrected or otherwise unexplained inputs are
preserved. The simulator and baseline check share the corrected parts; saved/imported loadouts remain unchanged.
Support attack gets the same missing contribution, while Shield & Heal Power and the existing recorded-score
anchor are preserved. The support total remains calibrated rather than claimed to be reconstructed exactly.

Soulshan's remaining difference is between two legitimate builds, not evidence that its in-game max CP is wrong.
The current response provides raid components and the higher score together; it does not provide a complete
separate max-CP loadout. Modeling both requires the matching gear snapshots. The warning now states only the setup
and reported scores, without claiming that the recorded score is stale or that another available snapshot must fit.

Regression fixtures retain just the CP breakdown, relevant stats and Vambraces item from these public responses.
