# DPS tab — how it works (October 18)

The DPS tab answers "why is this a better DPS upgrade?" in the player's own raids. Simulator owns gear edits; the DPS tab reads the selected plan (working copy or a saved simulation) and never changes it.

## Data: the player's own `encounters.db`, kept in this browser

Import reads the LOA Logs database in a worker and keeps one compact summary per cleared run (`run-summary.ts`, stored by `runs-store.svelte.ts` under `loa-sim:dps-runs:v1:<character>`): boss, difficulty, date, CP, spec, engravings, per-skill totals, gem levels and meter stat values. It now also preserves `loadout_hash` and the Evolution / Enlightenment / Leap nodes and Order core choices in `ark_passive_data`. Existing saved imports need a re-import to acquire those fields. Default range is the last 8 weeks. Nothing is uploaded.

LOA Logs skips the per-stat values in low performance mode. In the 10-12 database they exist for July to Aug 4 and again from Oct 10; skill totals, crits and cooldown data exist in every run.

## Page flow

1. **Header**: character, Current simulation or a saved build, current plan CP, and a link to Simulator. Selecting a build does not overwrite the working copy.
2. **Raids**: image cards allow multiple raids/difficulties. Selection is remembered per character, with migration from the old single-raid choice. Gates, individual clears and recorded Order core choices can narrow the sample.
3. **Scope**: display included clears and the selected raid/difficulty names. A selected Order setup is prominent; exclusions and import details are collapsible. Known engraving mismatches, different characters, failed fights and incomplete damage totals are excluded. Missing engraving data is reported as unchecked.
4. **Next Upgrades**: the same individual legal candidates as Simulator, with DPS gain, CP gain, cost and gold per 1% DPS. Sort by Most DPS, Most CP or Per gold; filter by category and optional budget. Unknown prices remain visible and do not count as within budget. Slot alternatives collapse to the best candidate for the selected sort unless All options per slot is enabled.
5. **Breakdown**: selected upgrade, skill shares where relevant, CP gain, and the same candidate by raid. Calculation details, cost assumptions and per-clear results are collapsed. Desktop places it beside the list; smaller screens stack it below.
6. **Prices**: reuse the shared Next Upgrades gold editor and material inventory. Per-level gem prices supply individual gems unless a specific quote exists. Honing uses average cost and character-bound stock. Missing required material prices block an efficiency estimate rather than silently treating purchased materials as free.

Every contributing clear is scored separately. Combined gain is the ratio of total target damage to total baseline damage, using the same fight durations. It is not the mean of clear percentages. Missing DPS coverage in any selected clear prevents an overall candidate rank; per-raid and per-clear coverage remains available.

Order core numbers identify the recorded Sun / Moon / Star choices, not core points or grade. The filter is selected from the logs; it does **not** automatically establish an exact match to the current snapshot. Full core points, astrogems and historical gear are not verified in this pass. This follows LOA Logs' public [`ArkPassiveData` / `ArkGridOrder` types](https://github.com/snoww/loa-logs/blob/master/src/lib/types.ts) and its [tooltip mapping](https://github.com/snoww/loa-logs/blob/master/src/lib/components/tooltips/ArkPassiveTooltip.svelte).

## Stat model (`dps-model.ts`)

Damage ∝ attack × (1 + additional damage) × (1 + evolution damage) × crit × everything else. Attack scales with √(main stat × Weapon Power), only the player's own share of attack grows, and +1% in a bucket with total T is worth 100 / (100 + T) %.

The bucket totals are a property of the gear: across one build's runs the meter's values give the same additional-damage total (48.8% for Soulshan over two weeks of different raids) and near-identical evolution, Atk. Power, Weapon Power, main stat and crit damage values. They're read back from the build's newest runs with values (within 1% CP of the newest) and applied to every gate, including low performance runs.

Crit rate is the exception: one build's +1% crit ranged 0.04%–0.67% by fight. Each clear uses its own recorded value. A clear without it cannot contribute to an upgrade that changes Crit Rate. Measuring crit from hits was tried and rejected: crits / hits and crit-damage share came out 2–10× off the meter, because a capped player still shows small non-critting hits and overcap is invisible.

Independent check so far: main stat isn't used to read the buckets; the model predicts +0.058% per 1,000 against the meter's +0.062% on Shanzkii's Serca G2.

## Known limits

- Cooldown gems remain visible with DPS not estimated; the old free-extra-casts approximation is not ranked on this page.
- Engravings, Ark Grid, karma and bracelet effect changes aren't valued yet.
- Next Upgrades in the Simulator still uses the older meter-only estimate (`dps-estimate.ts`).
- The recent-build bucket inference still uses a 1% CP window. Matching engravings and Order choices does not prove all historical gear matches the snapshot.
- No absolute future raid DPS, cutting advisor, full-grid Astrogem rescore or automatic upgrade application is introduced here.
