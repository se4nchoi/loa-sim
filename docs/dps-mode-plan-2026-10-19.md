# DPS mode on the Simulator (plan, 10-19-26)

Status: steps 1, 2 and 4 done (2 and 4 on 10-21, see the end). Step 1 built 10-19 (`/sim?mode=dps`: `DpsModePanel.svelte`, `sim/DpsMeter.svelte`, `dps-meter.ts`), checked on Soulshan's
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
- **Resolved 10-22:** Mathi supplied `https://loadout.mathi.moe/v3/loadouts/by-hash/<hash>` for these lookups,
  already cached on his server and Cloudflare. The proxy now uses that endpoint, with an adapter for its raw schema;
  the supplied Soulshan snapshot is tested against the independently decoded bible page snapshot.
- Soulshan, Serca NM 10-17: the bible character page is a CP setup (6797.64) while the clear's snapshot is 6523.07:
  same honing, accessories and gems; different Ability Stone, Bracelet, engravings, all three Ark Passive trees
  (Full Moon Harvester in the clear) and Ark Grid cores.
- Next: simulate the clear's setup itself (switch the character page's data to the clear's items, gems and cores, as
  Apply does), which would also check the engine (CP mode should land near 6523).
- Same CP can carry different hashes (two 6620.18 clears), so averaging "same gear" clears should compare snapshots'
  gear rather than hashes.

## Step 3, first part: order Ark Grid cores (10-19)

- `scripts/bake-order-cores.mjs` → `order-cores.ts`: every order core's bonuses by points and grade, effects parsed into
  always-on "<groups> Skill Damage / Damage to foes +a%" and Destiny effects (tied to their buff in the logs); the rest
  kept as text and named in the meter as not valued.
- Imports now keep each skill's damage under the encounter's Ark Grid buffs (`RunSkill.arkGrid`); older imports need
  "Re-import logs" for Destiny effects.
- `ark-grid-dps.ts`: per skill, (1 + new) / (1 + old) for always-on effects, and for Destiny effects only on the share
  of the skill's damage dealt under that buff. A Destiny effect the clear never had isn't placed.
- The clear's setup keeps its real order cores (`SimCore.as`); "Simulate from this setup" loads it into the Simulator.
- Check on Soulshan's Serca G1 10-17: Footsteps of the Dead relic → ancient ≈ +1.43% (+12.2m), Astaros +4.25%.
- Approximations: LOA Logs counts every hit while the buff is up; the "2 casts in Deathlord Mode" limit is taken as
  what the buff's own uptime already reflects. "In Deathlord Mode" always-on effects, cooldown effects and chaos cores /
  astrogem options are not valued yet.

Follow-up (10-19, later):
- Effects on one skill ("Astaros Damage +18%"), negative ones ("Ghast Skill Damage -20%") and effects in a state
  ("In Deathlord Mode, ...", "With Possession, ...", carried to the sentences after it) are parsed. States are valued on
  the damage the logs recorded under that identity buff (Deathlord Mode is logged; Possession isn't, so it's named).
- Imports keep each skill's damage under Ark Grid and identity buffs (`RunSkill.buffs`, names in `RunSummary.buffNames`).
- Core swaps (another core, not another grade) aren't valued: the clear's rotation would change (cooldowns, Destiny
  triggers). Raid cores vs CP cores came out at +11.5% mechanically, which isn't a believable number.

## Decisions and steps 2 and 4 (10-21)

- **One clear at a time.** The "Average of N same-gear clears" toggle is gone: each fight's crits, buffs and rotation are
  its own, and a single run fits the simulator idea better. The clear's own snapshot (LOA Logs' `loadout_hash`) is the
  baseline, so older clears work after the gear changed; clears without one fall back to CP matching with a warning.
- **Step 2:** Next Upgrades in DPS mode ranks **Most DPS | Per gold** (gold per 1% DPS); CP mode stays **Most CP | Per
  gold**. Each upgrade is scored on the meter itself (`meterGain` in `dps-meter.ts`: the picked clear with and without
  the upgrade), so a row's figure is what the meter shows after Apply. Upgrades touching something the meter doesn't
  value read "DPS not estimated", never 0%. The picked clear reaches Next Upgrades through `dps-selection.svelte.ts`.
  Replaces the older `estimateDps` ranking there.
- **Step 4:** the `/dps` tab is removed; `/dps` redirects to `/sim?mode=dps`.
- Next (agreed 10-21): model the damage buckets from the gear (Ark Passive, engravings, …) so stat edits don't need the
  meter's stat values; note where crit comes from (the character's own crit, support bracelet, party synergy) with the
  crit-rate value; Beta caveat with per-class verified badges; Ark Grid skill groups for every class, verified on logs;
  patch-dated game data with a warning on clears recorded before a class's last balance patch.

## Ark Grid for every class (10-22)

- Skill groups for all classes are baked from the game's own data (`scripts/bake-skill-groups.mjs`): a skill's Maxroll
  `category` is its class group, its `type` its kind (Point, Charge, Holding, Combo, Chain, Casting). Category names come
  from one lostarkcodex.com page per category (`scripts/skill-group-map.mjs`); Souleater matches the confirmed hand list.
- Core effects also parse: several named skills ("Rending Finisher and Exploding Finisher"), "In … Stance" / "While in …
  Mode" states, "While Destiny: X is active", Destiny buffs by name, and a Destiny sentence's last damage clause.
- Imports keep the player's own class-skill and Ark Passive buffs too ("Brawl King Stance", "Level 3 Hype").
- Checked on real clears, one relic core to ancient each: Breaker Charged Shock +0.94% (Shock +1.0%), Soulfist Blinding
  Obliteration +1.67% (World Decimation +5.56%) and Sky Shattering Strike +0.78% (Force +1.44%), Guardian Knight Finisher
  +0.81% (Exploding/Rending Finisher +4.0/+3.75%), Souleater Footsteps of the Dead +1.54%.
- Checked against the Korean core text (loaguard.com): Destiny: Charged Shock is a fixed increase (no 중첩 wording, where
  other cores say "4중첩"); a bare "Damage +x%" is one Korean sentence split in two, its target named before it
  (Blinding Obliteration 14P = 천하섬멸옥, Last Stand 17P = 익스플로전 피니셔 with the 푸른 심장 tripod, taken as met).
  Bare lines now take the skills or groups named in the sentence before; "per stack" effects stay unvalued.
- Still not valued: Incarnation Mode (not in the logs), "per stack" effects, cooldown/casting/resource effects, and a
  skill's own crit damage (Blinding Obliteration 10P).
