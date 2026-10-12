# DPS gain from the player's own logs (plan; log contents checked)

Status: planning. 2026-10-12: a real `encounters.db` checked, per-hit data confirmed (see "What the logs hold").

## Branch: `dps-sim/v0` (experimental)

The DPS work lives on `dps-sim/v0`, not `main`. It was briefly on `main` (`acacb39`, "DPS from your logs (first
step)") and was **reverted there** (`c1f4e4e`) so the live site doesn't carry it while it's experimental; the plan
notes stayed on `main`.

- Work on this branch: `git fetch && git switch dps-sim/v0`.
- **When it's ready for `main`**: merging alone won't bring the code back, because `main` already has the revert.
  On `main`, first `git revert c1f4e4e` (revert the revert), then merge `dps-sim/v0`.

What v0 has: Gems → Add damage shares → Load shares from LOA Logs also reads the meter's stat values
(`contributionSplits`) for the chosen runs, keeps them per character (`loa-sim:stat-values`), and Next Upgrades
shows "DPS ≈" next to CP for dealers on upgrades those values cover (`dps-stats.ts`). Next: test the import with a
real `encounters.db` in the browser, a "Most DPS" sort, DPS in All Upgrades, more stat types (bracelet crit lines,
evolution damage).

## Idea

For each simulated change (accessory line, bracelet, engraving, gem, ark grid, …), show the **DPS gain for this
player**, computed from their own LOA Logs runs, next to the CP gain. Optionally show it as DPS: average nDPS × (1 +
gain), e.g. 300m → 302.1m.

Not scaling by CP %: CP is already a damage multiplier, so "nDPS × CP %" says nothing new. The gain is worked out per
change, from the player's real numbers.

## Why the logs help

CP weighs every stat for an average player. The player's own runs know things CP can't:

| Kind of change | Logs vs CP | Why |
|---|---|---|
| Flat damage (additional damage, Atk Power, "damage +x%") | About the same | Boosts every hit equally |
| Crit rate / crit damage | Can differ a lot | Real crit rate in raids, with buffs and synergies |
| Back / head attack | Can differ | Real share of damage landing from behind / the front |
| One skill (gems, skill effects) | Can differ | That skill's real share (gems already do this) |
| Conditional effects (bracelet procs, "while X") | Can differ | Real uptime |

## Decisions so far

- **Own logs only.** No comparing players, no percentiles, no "do you meet the raid minimum" check: no official
  thresholds exist, it's the gatekeeping use Smilegate/AGS dislike, and lostark.bible (whose developer allows our
  fetches) already does percentiles.
- **Base on nDPS** (damage without external buffs), so the player's own stat changes show cleanly.
- **The logs pick up the build.** Per-skill data shows which build the player runs (e.g. Blunt Thorn efficiency), so
  the model doesn't have to guess.
- **No separate page**: load `encounters.db` once on the simulator and let Gems, Next Upgrades and skill-dependent
  cards use it. Read in the browser as today, nothing uploaded.

## Framing: replay the player's own runs

A universal score (Lopec-style) needs per-class, per-build weights that still compare fairly across classes, which
is hard. Instead, compare the player only with themselves: "if this exact run were repeated skill for skill with
upgrade X, 300m → 306.4m", averaged over runs of the same raid / gate / difficulty, and rank upgrades by that (and
by gold per DPS gained, as Next Upgrades does with CP).

| Change | Replayable? | How |
|---|---|---|
| Damage multipliers (additional damage, Atk Power, skill / gem damage) | Exactly | Scale each hit it applies to |
| Back / head attack effects | Exactly | Only the back / head hits |
| Conditional effects | Exactly | Only hits while the condition held |
| Crit damage | Exactly | Scale the hits that crit |
| Crit rate | Expected value | Crits can't be re-rolled; use each skill's real rate from the run (which includes that party's crit synergies), capped at 100% |
| Cooldown (CDR gems, Swiftness), attack / move speed, identity gain | No | They change the rotation itself; estimate separately and label it |

Exact replay needs per-hit data (damage with crit / back / front flags). If the logs keep only per-skill totals, the
same math runs on totals, a little less precisely.

### Speed → damage (from `Ability.json` / `ArkPassive.json`)

- **Raid Captain** (ability 1254, `troop_leader`): Outgoing Damage + `values[0]`/100 % of the Move Speed bonus,
  24% at the first level up to ~61% (rows follow the engraving grade × books × stone layout, like the CP table).
- **Supersonic Breakthrough** (ark passive 1040200 → ability 1000420, `sonic_boom`): Evolution damage + `v[0]` % of
  the Atk. + Move Speed bonus; if both are over the cap, + `v[1]` and `v[2]` % of the bonus above the cap; total
  capped at `v[3]`. Level 1 [500, 400, 1500, 1200] = 5% / +4% / 15% / 12% cap; level 2 doubles.
- Only needed when an upgrade changes speed (Swiftness, feast toggle): at the player's current speed these are
  already in the logged damage.

### Do bonuses add or multiply? (regression tried, inconclusive)

Fit log(hit damage) on buff indicators with fixed effects per (skill, hit index, crit / back / front) and per run,
Soulshan, 30 clears, 20,473 hits: coefficients are nowhere near the documented values (Total Offensive, +3% damage
taken, fits +300%; Corrosion fits −48%), residual sd 0.70. Buffs aren't independent of the fight: they cluster in
burst windows and boss phases (damage-reduction phases, shields, Deathlord Mode changing a skill's hits) and several
always come together, so observational fits can't separate them. Which bonuses share an additive bucket has to come
from game mechanics (the client's damage formula / KR community references), not from these logs.

### The damage formula LOA Logs uses (answers add vs multiply)

LOA Logs computes rDPS the same way we want to replay: per hit, change the stats, recompute the hit's final attack
power, and scale the logged damage by the ratio (`compute_hit_stat_damage_metrics` in `live/rdps.rs`, formula in
`calculate_final_attack_power`, `live/player_stats.rs`, read 2026-10-12). Its structure, described here (not copied;
the code is GPL-3.0): **every named stat is a bucket whose sources add; buckets multiply** (`mad(x)` = × (1 + x)).

1. Attack power before multipliers (main stat, Weapon Power, flat Atk).
2. × (1 + each of): `evolution_damage`, `attack_power_rate`, `skill_damage_sub_rate_1`, `skill_damage_sub_rate_2`,
   `attack_power_sub_rate_1`, `attack_power_sub_rate_2`, `outgoing_dmg_stat_amp`, `skill_damage_amplify`,
   `skill_damage_rate`, and the hit's element rate.
3. × (1 + `modify_damage_combat_effect`) × the boss "damage window" buckets, each its own: `domination_damage_rate`,
   `broken_bone_damage_rate`, `npc_action_weakness_damage_rate`, `stagger_combat_effect_damage_rate`, elemental
   damage taken, and the target's `physical|magical_inc_rate`, `_inc_sub_rate_1`, `_inc_sub_rate_2`.
4. × (1 + `move_speed_to_damage_rate`) (Raid Captain) × (1 + `critical_hit_to_damage_rate`) × element amplification.
5. × defense: (1 + D) / (1 + D × remaining), D = 1, remaining = (1 − amplify reduction)(1 − def_x reduction)
   (1 − penetration)(1 − skill penetration): every defense layer multiplies what's left (12% and 20% → 0.88 × 0.80).
6. × front / back attack amplify on front / back hits.
7. Crit: × (1 + `critical_damage_rate`)(1 + `critical_damage_rate_2`) × crit damage amplify; as an expectation,
   × (1 + min(crit rate, cap 100%) × (full crit multiplier − 1)).

Hyper Awakening hits only take `ultimate_awakening_damage_rate`. So "a new +6% damage taken" is worth 6% only if
nothing else is in its bucket: with Total Offensive (+3%) already in `inc_sub_rate_1`, another `inc_sub_rate_1`
source adds to that 3%; an `inc_rate` one multiplies. The buff → bucket map is the `keyStat` / `type` reading above.

Synergy types → buckets (`statusEffectValues`, /10,000 unless noted), per the meter:

| `type` | Slot → bucket |
|---|---|
| `instant_stat_amplify` | [0] crit rate, [1] crit damage, **[7] `outgoing_dmg_stat_amp`** (so Party: Damage Amplification etc. add with each other), [2] / [3] physical / magical defense break, [9] / [10] physical / magical crit damage amplify |
| `directional_attack_amplify` | [0] / 100 front, [4] / 100 back attack amplify |
| `instant_stat_amplify_by_contents` | −[2] element damage amplification, only when the hit's element is [1] |
| `skill_damage_amplify` | [1] × the casting support's brand power, limited to skill [0] / skill effect [4] when set |
| `attack_power_amplify` | [0] % of the **caster's** base Atk |

**Support stats the logs don't have** (decided 2026-10-12): `attack_power_amplify` needs the caster's base Atk and
`skill_damage_amplify` the caster's brand power, which the meter reads live from party members. Defaults from a real
1750 Artist (Brushann's bible loadout): **base Atk 166,260** (main stat 635,059, Weapon Power 226,415, Atk +7.4%)
and **brand power 8%** (High necklace line); both adjustable. They matter because a support's Atk buff adds to the
player's attack power before multipliers, so it lowers what main stat / Weapon Power upgrades are worth.

To replay an upgrade we need each bucket's **current total** per hit: the player's own static stats (bible loadout:
evolution damage from Ark Passive, Atk %, crit damage, …) plus the buffs active on that hit (the classification).

### Shortcut: the meter already saves marginal values

`encounter.misc.contributionSplits[]` (per player, by `name`) holds, from LOA Logs' own model with the player's
**inspected** stats, `{ damageDoneByStat, damageDoneByStatPlusValue }` pairs for `additionalDamage1percentDamage`,
`criticalHitRate1percentDamage`, `criticalDamageRate1percentDamage`, `evoDamage1percentDamage`,
`attackPower1percentDamage`, `weaponPower1percentDamage`, `mainStat1000Damage`, `weaponPower1000Damage`,
`attackPower1000Damage`, plus `raidCaptainEfficiency`, `bluntThornEfficiency`, `supersonicBreakthroughEfficiency`
and crit splits (`damageDoneWithAverageCrits`, …). Gain = plus ÷ base − 1. Soulshan, Deskaluda: +1% additional
damage → +0.668%, crit rate +0.15% (near the cap), crit damage +0.363%, evo damage +0.453%, Atk % +0.897%,
+1,000 main stat +0.053%, +1,000 Weapon Power +0.159%. Brushann: crit damage only +0.05–0.16% but crit rate
+0.84–0.95%; the per-character differences are the point.

Caveat: only filled in on recent logs (7 of the last 400 clears, all 2026-10-10 / 10-11, meter 1.51.x; it's on by
default and off in low performance mode). Older runs have zeros.

## Assumptions

- **Feast: on by default** (Atk. / Move Speed +5%), toggle to a great-success feast (+6%). Speed turns into damage
  for **Raid Captain** (damage from Move Speed bonus) and **Supersonic Breakthrough** (damage from Atk. / Move Speed)
  while Swiftness, class buffs and feast don't already reach their caps, and it offsets **Mass Increase**'s Atk.
  Speed penalty, so the replay needs the player's in-fight
  Atk. / Move Speed: profile + class buffs + feast, capped per effect. Everything else about speed (more casts per
  fight) stays with the cast-count estimate. The logs show a feast on ~99% of hits.
- **Azena's blessing: off by default** (it's a paid subscription); a toggle adds +6,000 main stat. **Main stat food:
  off by default**, one choice (only one dish works at a time) of the top two Masterwork steak meals:
  Specialist's Beef Tenderloin (+8,000 Str / Dex / Int, ilvl 1580) or Virtuoso's Striploin (+12,000, ilvl 1640);
  cheaper ones (Master's Herb, +6,000) are left out. Main stat upgrades are valued on the in-fight main stat (profile + whichever of
  these are on), since base attack goes with √(main stat × Weapon Power): a higher in-fight main stat makes each
  main stat upgrade worth a little less.
- **Poison / bleed (battle items) proc the same way** across a run and across the averaged runs. Their damage isn't
  on skill casts (part of the 1–4% the per-hit log doesn't cover) and doesn't come from the player's stats, so it's
  a fixed amount before and after an upgrade.

## Open problems

- **Synergies.** A flat +6% damage synergy is easy. Crit synergies are flaky: they depend on party makeup and uptime,
  and change the crit rate that every crit upgrade is valued against. With many builds around, this can go haywire.
  Options: use the crit rate the logs actually saw (includes whatever synergies those parties had); or let the player
  pick assumed party synergies; or show both "solo" and "with typical crit synergy".
- **Crit overcap**: gains from crit rate must stop at 100% per skill, using each skill's own rate.
- **Which runs**: same raid / gate / difficulty, recent runs, cleared only (the Gems import already filters like
  this: `LogsImport.svelte`, `rangeOf`, `raidGateOf`).

## What the logs hold (checked 2026-10-12 on a real `encounters.db`)

Format version 5 (`encounter.version`), logs back to 2025-11-06. Per player per fight, `entity.skills` and
`entity.damage_stats` are **gzip-compressed JSON** (start with `1f 8b`); `skill_stats` and `ark_passive_data` are
plain JSON.

- `entity.skills`: map of skill id → `totalDamage`, `hits`, `crits`, `critDamage`, `backAttacks` / `frontAttacks`,
  `backAttackDamage` / `frontAttackDamage`, `buffedBy` / `debuffedBy` (damage per buff id), `buffedBySupport`,
  `buffedByIdentity`, `buffedByHat`, `casts`, `timeAvailable`, gem levels (`gemDamage`, `gemCooldown`, `gemTier`),
  `tripodIndex`, and **`skillCastLog`: every cast with every hit**.
- Each hit: `timestamp`, `damage`, `crit`, `backAttack`, `frontAttack`, `buffedBy` (buff ids active on the player),
  `debuffedBy` (debuff ids on the target), `stagger`.
- `entity` also has `ndps` / `unbuffed_dps`, `combat_power`, `spec`, `engravings`, `ark_passive_data`.

Coverage over the last 25 cleared runs: the per-hit log adds up to **96–99.6% of a dealer's damage** (Souleater,
Soulfist, Guardian Knight; Hard, Nightmare and Level 3). Supports 48–85% (their own damage isn't the point). Crit /
back / front flags on every hit, buff lists on 98–100% of hits.

So **exact replay is possible**: every "Exactly" row in the table above can be computed hit by hit, and crit rate as
an expected value from each skill's own hits.

## Next step

Buff and debuff ids are just numbers. To tell a crit synergy or a damage buff from the rest (for the synergy options
above, and to work from nDPS by taking support / party buffs out), we need what each id is. The Maxroll tables we
cache don't have buffs, but **LOA Logs ships them**: `%LOCALAPPDATA%/LOA Logs/meter-data/SkillBuff.json` (27,667
entries: `name`, `desc`, `category` buff / debuff, `buffCategory`, `type`, `iconShowType` (self / party / all),
`duration`, `perLevelData` with the stat values). 5 of 6 sampled ids resolve (e.g. 605100063 Corrosion, Defense −1.8%;
2000263 Combat Blessing III); the missing one looks like an id the meter composes. The same folder has `Skill.json`,
`SkillEffect.json`, `ArkPassive.json`, `ArkGrid.json`, `CombatEffect.json`, … Next: classify ids into crit rate,
crit damage, damage %, defense down and "other" from `perLevelData` / `type`, and check against a few known synergies.
### Reading a buff (prototyped 2026-10-12 on 18 recent clears)

Values are in 1/100 %. A buff's effects come from `perLevelData[lv].passiveOptions` (`type: "stat"` with a `keyStat`)
and, for amplify-type synergies whose options are empty, from fixed slots of `statusEffectValues` by `type`:

| Source | Meaning | Checked |
|---|---|---|
| `stat` `critical_hit_rate` / `critical_dam_rate` | crit rate / crit damage | Master 140, Enhancement 2000 |
| `stat` `attack_power_rate`, `attack_power_sub_rate_*` | Atk % | Adrenaline 90, Fighting Spirit 600 |
| `stat` `skill_damage_*`, `evolution_dam_rate`, `ultimate_awakening_dam_rate` | damage % | Moonfall 1200, Dance of Passion 1400 |
| `stat` `physical/magical_inc(_sub)_rate*` (debuff) | damage taken % | Total Offensive 300 |
| `stat` `def_x` / `res_x` (debuff) | defense % | Defense Destruction −2000 |
| `instant_stat_amplify` sev[0] / sev[2] / sev[7] | crit rate / defense / damage taken | Weak Point 180 (1.8%), Corrosion −180, Party: Damage Amplification 600 |
| `skill_damage_amplify` sev[1] | damage taken | Ink Brand 1000 (10%) |
| `directional_attack_amplify` sev[0] | back / front damage | Open Weakness 5 |
| `attack_power_amplify` sev[0] | % of the caster's base Atk (support) | Sunsketch / Sun Well 1600 |

Ids above 1,000,000,000 are the meter's own: `1e9 + source skill id + buff id` (`get_new_id` in loa-logs'
`live/utils.rs`), so the same buff from different skills stays apart. Decode by matching `buff.id + s` for each
`s` in `buff.sourceSkills` (all 8 sampled resolve: Party: Damage Amplification ×3, Moonfall, Fighting Spirit, …).

With those rules, damage-relevant effects cover the hits' buff weight; the rest is speed, food, shields, cooldown,
and damage-over-time on the boss.

- **Conditional effects** (`passiveOptions` `combat_effect` → `CombatEffect.json[keyIndex].effects[]`): each has
  `conditions` and `actions`. Over 24 clears the action is almost always `modify_damage` (args[0] in 1/100 %: Pray
  130 = +1.3%, Destiny: Finisher 2500 = +25%); conditions are `current_skill` (match the hit's skill id),
  `identity_stance` (Decimation lists all stances: always on), none, or `npc_grade_greater` (a boss: always on in
  raids). `exec_start_skill` (Destiny: Regain) only fires another skill, whose hits are logged on their own;
  `modify_damage_shield_multiplier` (Spear of Justice) is a fight mechanic.
- **Values in description templates**: e.g. Destiny: Footsteps of the Dead has no options; its desc reads
  `<$TABLE_ABILITYFEATURE Value03 3461200 1/>`, which is `Ability.json[3461200].levels[1].values[3]` = 5400 →
  Stygian skill damage +54% (+64% at level 2), `values[7]` = 2 uses, `values[2]` = the skill group. Fill templates
  from the table they name.
- **Content buffs** (`instant_stat_amplify_by_contents`, e.g. Lostwind Cliff holy damage taken +3.5%) are fight
  mechanics: fixed context like poison / bleed.

What the classification is for: the replay compares each hit with itself, so a buff that's the same before and
after an upgrade cancels out. It matters for (1) crit rate (cap at 100% per skill, value crit upgrades), (2)
effects in the **same additive bucket** as the upgrade (a new damage % adds to them rather than multiplying, so it's
worth less): which effects share a bucket is the open question, and (3) effects the upgrade itself replaces
(a bracelet effect, an Ark Grid core).

License: `meter-data/` lives in the LOA Logs repo (`snoww/loa-logs`, `src-tauri/meter-data/`), which is **GPL-3.0**
(the older `lost-ark-dev/meter-data` has no license, last pushed 2024-06). So read `SkillBuff.json` at runtime from
the player's own LOA Logs folder, next to `encounters.db` (nothing redistributed, and it matches their meter's
version). Baking a copy or a derived table into loa-sim would mean shipping GPL-3.0 material; loa-sim has no license
of its own yet, so that's a deliberate choice, not a default.

## Rough shape once the fields are known

1. Worker: per selected runs, per skill: damage share, crit rate, crit-damage share, back / front shares, buff uptime.
2. Model: for a change, per-skill damage multiplier from those numbers; DPS gain = Σ share × multiplier − 1.
3. UI: "DPS (your logs)" next to CP % in Next Upgrades and on the cards' change previews; a note when a change type
   isn't covered by the logs (falls back to CP).
4. Tests against a fixture built from a real `encounters.db` slice.
