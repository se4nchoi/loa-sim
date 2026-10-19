# DPS mode on the Simulator (plan, 10-19-26)

Status: step 1 built 10-19 (`/sim?mode=dps`: `DpsModePanel.svelte`, `sim/DpsMeter.svelte`, `dps-meter.ts`), checked on Soulshan's
live logs (Serca NM 10-17: weapon +1 → +0.95%, Gluttony damage gem 9 → 10 → Gluttony +4.14%). Step 2 next. Replaces the answer-first plan
(`dps-answer-first-plan-2026-10-19.md`): the DPS view becomes a simulator you play with, not a static recommender. Its
"top pick" can live in the right pane.

## Shape

- **A CP ↔ DPS switch on `/sim`.** Same character, same cards (equipment, accessories, gems, karma, Ark Grid, …), same
  right pane. DPS mode adds, at the top: a raid / clear selector, the LOA Logs import, and a big horizontal meter.
- **The meter** (LOA Logs / bible style): total DPS as a big number that animates like the CP number, then one bar per
  skill. Each bar shows the recorded value plus the change from the current edits, highlighted ("Vestige 212m → 219m,
  +3.4%"). Stat edits scale every skill alike in the model; gems and skill-group effects move single skills.
- **Right pane** in DPS mode: Next Upgrades ranked by DPS gain (the current DPS tab's ranking), CP shown beside it.
- **The separate `/dps` tab** goes away once DPS mode covers it.

## Baseline and scope

- **One clear by default.** "This run, 6:14, 1.03b DPS" is concrete. Optional: average the clears of the same gate that
  were played with the same gear (same LOA Logs `loadout_hash`, or CP within ~0.5%). No mixing of raids.
- **Gear baseline = the snapshot that matches the clear.** Logs don't record gear, only CP, engravings, ark passive and
  a loadout hash. Among the character's kept bible snapshots, use the one whose CP matches the clear's recorded CP
  (within ~0.5%). If none matches: say so ("your gear here is 2.3% CP off this clear") and allow simulating from the
  current snapshot, clearly marked.

## Performance (measured 10-19 on Soulshan, 12 clears, Node)

- Whole-plan DPS change for the meter: ~0.4 ms per evaluation (`statDeltas` + `modelGain`): live on every edit.
- Next Upgrades list: ~95 ms; DPS ranking of 64 upgrades × 12 clears: ~131 ms: debounced like Next Upgrades today.
- DPS mode's code and wa-sqlite load only on first switch; imported runs are a small localStorage read.

## Modeling beyond stats

- **Boss damage:** a flat multiplier on every hit (its own bucket).
- **Ark Grid cores:** the Maxroll feed (`cache/maxroll-items.json`, `maxroll-stats.json`) lists each core's bonuses by
  point threshold (10/14/17/18/19/20P, more with grade) as `arkCore.bonuses` → `arkGridCoreOptions[id]` (description
  plus stat references). Kinds, for Souleater (class 405, 18 core groups):
  - Per-point (18 → 20P) and flat bonuses: "Stygian Skill Damage +0.6%" → skill-group share of logged damage × % →
    accurate. Needs `skill-groups.ts` (Souleater confirmed 10-19, from lostarkcodex.com skill tags).
  - "In Deathlord Mode, +X%": LOA Logs' per-skill `buffedByIdentity` is the damage dealt under the identity buff
    (Deathlord mode for Souleater; to confirm) → direct share, no per-hit replay.
  - Procs ("On Destiny activation, Stygian +64% for 2 casts"): Ark Grid proc buffs have ids in LOA Logs' buff data
    (e.g. 3461200 "Destiny: Footsteps of the Dead", buffCategory arkgrid), and per-skill `buffedBy` gives the damage
    dealt under each → measured for a core the player already runs; "up to" for one they don't.
- **Karma, engravings, bracelet effects:** later, one at a time.
- Souleater first to check the engine and model; then the other classes the player plays.

## Steps

1. CP/DPS switch on `/sim`; raid + clear selector (one clear default, same-gear average optional); snapshot matched by
   CP with a warning; live meter (total + per-skill bars, change highlighted). Right pane unchanged.
2. Right pane ranked by DPS in DPS mode (reuse `compareDpsUpgrades` / `rankDpsCandidates`).
3. Boss damage; Ark Grid cores for Souleater (per-point/flat → identity-mode → procs); then other effects and classes.
4. Retire `/dps`.

## Notes from step 1 (10-19)

- LOA Logs' `combat_power` for Soulshan's 10-17 Serca clear is 6523.07 while the current bible snapshot is 6797.64
  (+4.2%): either gear changed since, or the two CP numbers differ in what they include. Worth checking on a clear
  played right after a bible snapshot before trusting the 0.5% match.
- The live database has `combat_power`, `gear_score` and `ark_passive_data`, but `loadout_hash` was empty, so
  same-gear grouping falls back to CP. `cache/dps-real-soulshan.db` (10-13) lacks those columns; use
  `cache/dps-live-soulshan.db` (87 clears, 6.9 MB, made from the live DB read-only) for testing.
- The old `/dps` tab still exists; the Simulator's link now points to DPS mode.

## The clear's own setup (10-19)

- LOA Logs stores each clear's `loadout_hash` ("v3/<64 hex>", 85 of Soulshan's 87 recent clears), which is a lostark.bible
  snapshot of the gear it was played with: `https://lostark.bible/character/snapshot/<hash>/__data.json` (~13 KB:
  items, gems, Ark Grid cores, Ark Passive, engravings, karma, cards, elixirs, CP; **no battle point parts or stats**,
  so it can't be scored on its own).
- `/api/snapshot/<v>/<hash>` fetches it through our server (one per clear the player picks; cached forever, since a
  hash's content never changes); `clear-snapshots.ts` keeps it in the browser; `setup-diff.ts` compares it with the
  loadout being simulated and DPS mode shows the differences (gear slots, gems, Ark Grid cores and Ark Passive nodes by
  name from `ark-passive-names.ts`, baked by `scripts/bake-ark-passives.mjs`).
- **Ask lostark.bible's developer before shipping:** the server-fetch OK was for character pages ("one character per
  player action"); snapshot fetches are the same scale but a different endpoint.
- Soulshan, Serca NM 10-17: the bible character page is a CP setup (6797.64) while the clear's snapshot is 6523.07:
  same honing, accessories and gems; different Ability Stone, Bracelet, engravings, all three Ark Passive trees
  (Full Moon Harvester in the clear) and Ark Grid cores.
- Next: simulate the clear's setup itself (switch the character page's data to the clear's items, gems and cores, as
  Apply does), which would also check the engine (CP mode should land near 6523).
- Same CP can carry different hashes (two 6620.18 clears), so averaging "same gear" clears should compare snapshots'
  gear rather than hashes.
