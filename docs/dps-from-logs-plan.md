# DPS gain from the player's own logs (plan; log contents checked)

Status: planning. 2026-10-12: a real `encounters.db` checked, per-hit data confirmed (see "What the logs hold").

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

## Assumptions

- **Feast: on by default** (Atk. / Move Speed +5%), toggle to a great-success feast (+6%). Speed doesn't scale a
  hit, so the replay leaves it alone; it only matters for the cast-count estimate (cooldown / speed changes). The
  logs show a feast on ~99% of hits anyway.
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
and damage-over-time on the boss. Left to do: `combat_effect` options (~3%: bracelet Pray "+1.3% damage", Ark Grid
Destiny cores) via `CombatEffect.json`; skill-specific Ark Grid buffs whose value lives in `ArkGrid.json`
(Destiny: Footsteps of the Dead); and `instant_stat_amplify_by_contents` (content buffs, different slot layout, e.g.
Lostwind Cliff holy damage taken +3.5%).

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
