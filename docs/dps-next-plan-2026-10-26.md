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

### 1. Bracelet conditions (audited 10-27; safe portion implemented)

- `braceletPart` now separates the Demon/Archdemon bonus from Additional Damage. Race comes from the game's NPC
  species in LOA Logs' `Npc.json`, baked with `scripts/bake-boss-species.mjs`; Maxroll's `npc` table is rapport NPCs.
- `gateDemonSpecies` checks every listed boss/phase. Known non-Demon gates no longer flag an inactive bonus as
  uncounted. It assumes scalable damage hits those bosses; adds aren't reconstructed. Unknown classifications stay
  unknown. Kazeros G2 and Aegir G1 have mixed races: the final boss's species cannot stand in for the whole run.
- The bonus uses stats 126/136, not Additional Damage (50). Card books use the same species stats. Adding 2.5 pp
  to a 6% species bucket gives `1.085 / 1.06`, not `1.025`. The snapshot doesn't contain the card-book total.
  **User decision 10-27: leave card-book inputs out.** Their damage is already in the recorded run. Changed species
  bonuses on Demon/Archdemon or unresolved gates therefore remain uncounted; unchanged bonuses cancel on roll upgrades.
- **Stagger remains uncounted.** `stagger_log` is gauge progress, not confirmed stagger windows, and the upstream
  recorder is commented out. Do not use elapsed fight-time share as damage share. Newer `npcWindows` contribution
  pairs aggregate the effect's damage contribution, not a reusable per-skill damage-during-stagger split.
- Tests: `boss-species.test.ts`, `dps-meter.test.ts`, `dps-stats.test.ts`. See the validation addendum for source links.

### 2. Full-uptime assumptions for run-dependent lines (implemented 10-27)

- `scripts/order-core-assumptions.mjs` retains explicit stack caps before description cleanup; per-stack damage is
  multiplied by that cap. Selected timer and next-use damage lines assume full uptime. Missing/conflicting caps,
  unresolved skill targets, combined cooldown trades, forced-position changes and alternative trigger bonuses stay text.
- Re-baked `order-cores.ts`: 40 assumed effects across 38 options / 17 classes (38 newly valued damage lines; two
  existing max-stack threshold bonuses explicitly reclassified). The 2,160 core definitions are unchanged. Comparison
  by option id / effect contents confirms no previously valued effect is lost. Full per-class counts are in validation.
- `ark-grid-dps.ts` applies these assumptions on their named skills without needing buff windows. Feature-level
  replacements still work (e.g. Eternal Blood's 17P line replaces its lower Sinister bonus). Existing counted windows
  remain recorded, including Footsteps of the Dead. Unchanged buff buckets cancel and no longer request a re-import.
- Limits names the core assumptions once, alongside Adrenaline 6 stacks / Ether Predator 30 and bracelet Weapon Power.
  No extra casts, core-swap simulation, or rotation reconstruction added.
- 818 tests pass, one opt-in audit skipped; Svelte/TypeScript and production build pass. No new real-run backtest was
  performed in this pass. Next substantial work is task 3, automatic combat totals from gear.

### 3. Our own per-stat gain engine (the main assumption; larger)

**10-27 progress / current boundary:** Additional Damage is automatic (63 comparisons, mean relative marginal error
0.0520%, max 0.1851%). Soul Eater AP% uses actual complete buff intersections (22 comparisons, mean 0.2776%, max
0.4836%), only for independent AP edits. Evolution efficiency recovers a uniform marginal in 197/198 extracted
runs, including 109 without ordinary stat values; all 88 measured runs agree within 0.00004% relative error. No new
passive editor. Corrected support/AP and vambrace Basic-flat placement. DPS mode, rankings and shares use the same
accepted coefficients. The full automatic context is still not enabled.

**Blocked after trying every remaining stat bucket:** root/flat attack needs historical support attack amounts;
primary Crit Damage needs cast-time skill/effect conditions (prototype still ~7.1% off); Crit Rate/Blunt Thorn edits
need uncapped rate distributions. Full details, data coverage and resumption inputs:
[implementation and validation](dps-gear-context-2026-10-27.md). Other classes/incomplete traces keep the fallback.
Do not replace these unknowns with zero support, observed crit rate, or a fitted constant. The remaining bullets
below describe the full goal, not completed features.

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
