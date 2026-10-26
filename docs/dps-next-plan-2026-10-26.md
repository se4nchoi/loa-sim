# DPS / support sim: next work — 2026-10-26

Handoff for the next agent (Codex). Branch `dps-sim/v0` (pushed; `main` untouched, don't merge into it unasked). Read
`AGENTS.md` first (no-filler UI rule), then `docs/dps-validation-2026-10-25.md` (what's been checked) and
`docs/dps-prelaunch-state-2026-10-22.md` (open checks). Commit trailer and push rules: as in earlier commits; never push
or touch `main` unless the user asks.

## Decisions the user made (don't re-litigate)

- **One run, not an average.** The meter scales the single run the player picked. Averaging runs is rejected: a run is
  better because of crits on the big skill, uptime, not dying, a found DPS window. Showing other runs beside it (already
  there) is fine; pooling them into the number is not.
- **Order cores: only the build being played.** A core *swap* changes the whole character (3 Order core choices per
  class build), so it stays unvalued. What players want is the same core's upgrade (relic → ancient, more points),
  which is valued.
- **Assume effects in full where the run can't tell.** Prefer a stated full-uptime assumption over "not counted":
  Adrenaline at 6 stacks all fight, per-stack Order core lines at max stacks, timed / next-N-uses lines up, the player
  in the max-stack / max-crit zone. Then relic → ancient on such a line is computable (e.g. +22% → +24%). Each such
  assumption must be named once in the Limits fold (one line, no filler), not hidden.
- **Paradise power curve**: calibrate slowly as the user's Paradise power grows week to week (runs on the same orb at
  known powers), no rush.
- **Missing class data** (summon / DoT ids, Echoing Steel / Death debuff ids, Sorceress "Casting Control"): collect from
  players during beta; don't guess.
- **Ark Passive stat optimizer / cap checker**: a separate, secondary project later (KR has iloa.gg / loagg.com tools;
  none read NA/CE characters). Not now.

## Tasks, in order

### 1. Bracelet conditions the logs can answer (small, less fuzziness)

`src/lib/upgrade-planner/dps-stats.ts` `braceletPart` lists these as `unvalued`; the meter shows them under "not
counted" on many runs.

- **"Bonus vs. Demon/Archdemon +x%"**: the boss's race decides it, always on or always off. Needs a boss → demon flag
  (per raid / gate; LOA Logs `current_boss` names; a small table in `src/lib/logs/raids.ts` or next to it, sourced from
  game data if the Maxroll feed has NPC race — check `cache/maxroll-stats.json` `npc` / `npcGrade` first, else a hand
  list confirmed by the user). Value it as an Additional-Damage-like multiplier on the run when the boss is a demon,
  nothing otherwise, and drop it from `unvalued`.
- **"Outgoing Damage +x% to Staggered foes"**: the encounter keeps `stagger_log` (column in `encounter`). Read the share of
  the player's damage dealt while the boss was staggered (time windows from `stagger_log` against hits is not available
  per hit in summaries; use the fight-time share as the proxy, stated as an assumption) in `logs-worker.ts`
  `runSummaries`, store it on `RunSummary`, and value the line on that share. Older imports without it: keep "not
  counted".
- Tests in `dps-meter.test.ts` (`describe('bracelet effects')` has the pattern).

### 2. Full-uptime assumptions for run-dependent lines (medium)

- **Order cores**: `scripts/bake-order-cores.mjs` keeps `per stack`, `for Ns`, `next … for N uses` lines as `text`.
  Parse them into effects with an `assumed: 'max-stacks' | 'full-uptime'` flag: per stack → `pct × max stacks` (the
  "(Max N stacks)" / "Up to N stacks" text is stripped today in `effectsOf` — keep N before stripping); timed and
  next-N → as if always on. Cooldown-for-damage trades and skill-tree conditions stay text (rotation changes).
  `ark-grid-dps.ts` values `assumed` effects like the rest; the Limits fold lists "assumed at full stacks / uptime" once.
  Re-bake (`node scripts/bake-order-cores.mjs`) and compare per-class coverage before/after (the session used a small
  script: count options fully valued and damage lines left as text per class; make sure nothing previously valued is
  lost — compare option by option, not by index).
- **Engravings**: the engraving damage table (`tables.ts` `ENGRAVING_TABLE`, from inven) already assumes full stacks
  (Adrenaline 6 stacks, Ether Predator 30). Keep; just name it in the Limits fold.
- Check the "not counted" list on Soulshan's runs before/after (dev audit below).

### 3. Our own per-stat gain engine (the main assumption; larger)

The user thought this was already the plan: build it. Today stat edits use LOA Logs' per-stat values
(`contributionSplits.*1percentDamage`, `src/lib/logs/stat-values.ts`); 56% of Soulshan's runs lack them and borrow from
the nearest run (`dps-meter.ts` `statValueRuns`, a stopgap). An independent engine exists but takes hand-entered totals:
`src/lib/upgrade-planner/dps-stat-engine.ts` (`statGain`, `DamageContext`), `DpsStatContext.svelte`,
`dps-configured.ts`, `docs/dps-failed-pull-feasibility-2026-10-21.md`, `docs/dps-from-logs-plan.md` (damage formula and
buckets).

- Fill `DamageContext` from the run's gear snapshot automatically: main stat, Weapon Power, base attack %, Atk. Power %,
  flat attack, Additional Damage, evolution damage, crit rate (gear + engravings + Ark Passive + cores + astrogems +
  identity; party synergies as a stated default), crit damage, crit cap / Blunt Thorn conversion. Sources: `simulate.ts`
  (main stat, WP), `dps-stats.ts` (lines, bracelet), `dealer-grid-stats.ts` (chaos cores, astrogems), engravings table,
  Ark Passive nodes (`cache/maxroll-stats.json` `arkPassives`; Evolution tier nodes like Blunt Thorn / Supersonic).
- Cross-check against LOA Logs' values on runs that have them (Soulshan has ~88; the dev audit can list them): the
  engine's per-stat gains vs `statValues`, per stat. Agreement within a few percent is the bar; record results in
  `docs/dps-validation-2026-10-25.md`.
- Then switch the meter to the engine when LOA Logs' values are missing (instead of borrowing), and consider using it
  always with LOA Logs' values as the check.

### 4. Paradise power calibration (ongoing, tiny)

`dealer-grid-stats.ts` `paradiseFactor` assumes proc damage ∝ (power + 2.5M) (the orb's CP formula, unconfirmed). Each
week: the user's runs on the same orb (proc ids in `paradise.ts` `PROC_ORBS`) at the then-current Paradise power — max
hit of the proc skill vs power. Log points in `docs/dps-validation-2026-10-25.md`; fit when there are 3+.

### 5. Beta data requests (when players send them)

Use the dev audit on a public lostark.bible log the player links (one request, kept in `cache/`):
`LOG=<id> PLAYER=<name or class> npx vitest run src/lib/dev/public-log.audit.test.ts` with the dev server up
(`preview_start demo` / `npm run dev`). It reports skill coverage, one-step edits, each Order core line's reach, and for
supports the buff split and core lines. Wanted: Summoner (Phoenix / Akir / Maririn / Pauru ids), Reaper (Heavy
Bleeding), a support with Echoing Steel or Echoing Death (their debuff buff ids → `support-meter.ts`
`gearDebuffFactor`), a Sorceress on the Reflux / Casting Control cores.

## Tools already in the repo

- `src/lib/dev/dps-backtest.ts`: `coverage(file, player, loadout, newest)` (each run's setup → current gear: what's not
  counted / noted) and `backtest(...)` (run pairs: predicted vs measured; run-to-run noise is ±10–20%, so only big
  changes show). Browser console on the dev server; serve the encounters.db copy from a local CORS server.
- `src/lib/dev/public-log.audit.test.ts`: one public log, one player (see 5).
- LOA Logs data: never write to `%LOCALAPPDATA%/LOA Logs/encounters.db`; copy it to `cache/` first.
