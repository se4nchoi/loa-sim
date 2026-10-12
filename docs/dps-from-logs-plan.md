# DPS gain from the player's own logs (plan, not started)

Status: planning, parked 2026-10-12. Pick up on the home laptop, where an `encounters.db` is available.

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

## Open problems

- **Synergies.** A flat +6% damage synergy is easy. Crit synergies are flaky: they depend on party makeup and uptime,
  and change the crit rate that every crit upgrade is valued against. With many builds around, this can go haywire.
  Options: use the crit rate the logs actually saw (includes whatever synergies those parties had); or let the player
  pick assumed party synergies; or show both "solo" and "with typical crit synergy".
- **Crit overcap**: gains from crit rate must stop at 100% per skill, using each skill's own rate.
- **Which runs**: same raid / gate / difficulty, recent runs, cleared only (the Gems import already filters like
  this: `LogsImport.svelte`, `rangeOf`, `raidGateOf`).

## First step at home

Open a real `encounters.db` and list what each skill entry in `entity.skills` holds, and whether there is a per-hit or per-cast log (for exact replay). Today
`src/lib/logs/logs-worker.ts` reads only `total_damage` and `timeAvailable`. Believed to exist but unconfirmed: crits
and crit damage, back / front attack damage, buffed-by / debuffed-by damage per buff id, casts and hits. Which of
these exist decides how much of the table above is buildable.

## Rough shape once the fields are known

1. Worker: per selected runs, per skill: damage share, crit rate, crit-damage share, back / front shares, buff uptime.
2. Model: for a change, per-skill damage multiplier from those numbers; DPS gain = Σ share × multiplier − 1.
3. UI: "DPS (your logs)" next to CP % in Next Upgrades and on the cards' change previews; a note when a change type
   isn't covered by the logs (falls back to CP).
4. Tests against a fixture built from a real `encounters.db` slice.
