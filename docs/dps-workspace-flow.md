# DPS tab — how it works (October 14)

The DPS tab answers "why is this a better DPS upgrade?" in the player's own raids. Simulator owns gear edits; the DPS tab reads the selected plan (working copy or a saved simulation) and never changes it.

## Data: the player's own `encounters.db`, kept in this browser

Import reads the LOA Logs database in a worker and keeps one compact summary per cleared run (`run-summary.ts`, stored by `runs-store.svelte.ts` under `loa-sim:dps-runs:v1:<character>`): boss, difficulty, date, CP, spec, engravings, per-skill damage / crit damage / hits / crits / casts / time available / gem levels, and the meter's per-stat values when it recorded them. Default range is the last 8 weeks (all time for one character can be 1+ MB). Nothing is uploaded and no external log site is used.

LOA Logs skips the per-stat values in low performance mode. In the 10-12 database they exist for July to Aug 4 and again from Oct 10; skill totals, crits and cooldown data exist in every run.

## Page flow

1. **Header**: character, gear plan, CP before → after.
2. **Pick a raid gate**: gates the player cleared, with difficulty and gate badges, clears, how many have the meter's values, and the last date.
3. **Best upgrades for DPS in that gate**: every candidate from Next Upgrades that moves covered stats (honing, quality, bracer, accessories), plus one level on each skill gem, ranked by DPS with CP beside it. Each accessory slot shows its best option unless asked. A note flags where CP ranks an upgrade much lower.
4. **Why**: for a gem, each skill it touches (share of damage × how much harder) plus its base attack; for a stat upgrade, each damage bucket it moves.
5. **Across raids**: the same upgrade in each gate. Gems differ by each fight's skill shares; stat upgrades are identical everywhere unless they touch crit rate.
6. **Run by run and sources**: per-run gem gains in the chosen gate; which runs the bucket totals came from; our model next to the meter's own values for this gate.

## Stat model (`dps-model.ts`)

Damage ∝ attack × (1 + additional damage) × (1 + evolution damage) × crit × everything else. Attack scales with √(main stat × Weapon Power), only the player's own share of attack grows, and +1% in a bucket with total T is worth 100 / (100 + T) %.

The bucket totals are a property of the gear: across one build's runs the meter's values give the same additional-damage total (48.8% for Soulshan over two weeks of different raids) and near-identical evolution, Atk. Power, Weapon Power, main stat and crit damage values. They're read back from the build's newest runs with values (within 1% CP of the newest) and applied to every gate, including low performance runs.

Crit rate is the exception: one build's +1% crit ranged 0.04%–0.67% by fight. It uses the gate's own runs with values and is left out otherwise. Measuring crit from hits was tried and rejected: crits / hits and crit-damage share came out 2–10× off the meter, because a capped player still shows small non-critting hits and overcap is invisible.

Independent check so far: main stat isn't used to read the buckets; the model predicts +0.058% per 1,000 against the meter's +0.062% on Shanzkii's Serca G2.

## Known limits

- Cooldown gems count extra casts as free; labeled "rough".
- Engravings, Ark Grid, karma and bracelet effect changes aren't valued yet.
- Next Upgrades in the Simulator still uses the older meter-only estimate (`dps-estimate.ts`).
