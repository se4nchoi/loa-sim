# Failed-pull upgrade estimates: feasibility, 2026-10-21

Assessment on `dps-sim/v0` at `b378e57`. No application code changed for this investigation.

## Decision

Feasible in stages using the existing browser-local log reader and DPS meter. A failed pull does not need a Bible
clear to supply observed damage. Equipment provenance and missing damage-model inputs are the main constraints.
Showing a failed pull is a small extension; reliably answering a phase damage checkpoint requires additional data
retention and validation. Do not present whole-pull average DPS as a phase-checkpoint prediction.

## Evidence checked

- `cache/dps-real-soulshan.db` has 42 failed encounter previews. Joining the local player's entity and encounter
  data produces 41 failed pulls with usable damage and duration. The other preview has no matching joined row.
- All 41 pass through the existing `runSummary` function. The existing `dpsMeter`, given unchanged simulation
  inputs, reproduces their recorded damage. These functions do not require a clear.
- All 41 retain timestamped hits and cooldown-use data in the original database. Timestamped hits cover a median
  98.96% of reported skill damage, with a range of 56.36–100%. Coverage must be checked, not assumed complete.
- Only 1/41 has usable meter stat values. With fixture equipment supplied as a harness baseline, the engine gives
  a positive weapon-honing estimate for that one and correctly leaves the other 40 unknown. This checks engine
  compatibility only: the fixture equipment was not confirmed as those failed pulls' actual equipment.
- This older database slice lacks equipment-hash, CP, and build columns. It cannot establish whether newer failed
  pulls have usable hashes. The newer local slice has 87 clears and no failed pulls, so that remains unverified.
- A newer cached database includes `boss_hp_log`, with timestamped HP and HP fractions by boss. The current import
  does not retain this data. Its availability and meaning on actual failed checkpoint attempts still need checking.
- Mathi's provided endpoint returned HTTP 200 and JSON: 13 equipped items, 11 gems, 6 cores, skills and tripods,
  equipped skills, cards, passive nodes, karma, engravings, and recorded CP. It has no calculated stat totals or
  battle-point parts. Its raw schema differs from our existing `ClearSnapshot` schema.

The endpoint inspected was:
`https://loadout.mathi.moe/v3/loadouts/by-hash/36a26708fae48f6b0a05ce80d57fe5e0fb530383a3c8377f5382995a23feeac4`.
Mathi confirmed upstream caching in his response; this does not guarantee a snapshot exists for every failed pull.

## Existing integration points and blockers

| Area | Current implementation | Required change |
| --- | --- | --- |
| Read local logs | `logs-worker.ts` lists encounters and reads requested run IDs regardless of clear status | Reuse; retain missing-data handling |
| Import runs | `DpsRunsImport.svelte` counts and imports cleared encounters only | Add selectable failed attempts; avoid automatically storing every wipe in eight weeks |
| Select run | `DpsModePanel.svelte` filters to clears | Add clear/failed/unknown outcome labels and attempt selection |
| Select calibration cohort | `comparisonScope` rejects non-clears; build buckets use recent CP-near runs | Separate observed-attempt eligibility from calibration eligibility; do not pool a different build just because CP is close |
| Fetch equipment | Server `bible.ts` uses Bible's Svelte page data and `decodeSnapshot` | Fetch Mathi's fixed-host endpoint and normalize its raw schema through a tested adapter |
| Reconstruct equipment | `clearState` overlays a snapshot on a scored character loadout | Treat this as an approximation; track inherited, reconstructed, and inferred inputs |
| Calculate edits | `dpsMeter` already accepts failed summaries | Reuse supported effects; keep missing inputs unknown and partial gains explicit |
| Phase checkpoints | Stored summaries retain skill totals, not timestamps or boss HP | Add on-demand time-window data and a separate checkpoint result |

`clearState` currently inherits some context from today's character and can infer a Paradise orb from CP. It does
not turn a raw historical snapshot into a fully independent historical baseline. Mathi's endpoint changes data
access, not this limitation. A matching CP alone also cannot prove a matching build.

## Proposed sequence

1. Add the Mathi response adapter and tests for gear slots, rolled stats, stone nodes, gems, passive nodes, karma,
   cores, and unknown fields. Preserve raw context needed for future DPS modeling. Cache successful snapshots by
   version/hash and combine simultaneous fetches; avoid long-lived caching of missing/error responses.
2. Import and select a failed attempt. Keep clears available for reference, but never silently use another run's
   performance as the selected attempt. Support unknown clear status separately from a confirmed failed attempt.
3. Resolve its equipment with explicit provenance: exact run hash if available and resolvable; otherwise a
   user-confirmed saved snapshot or manually adjusted setup. Compare recorded engravings, gem levels, and passive
   choices when present. A nearby clear's snapshot is a candidate, not an automatic match.
4. Ship whole-attempt upgrade comparisons for effects the current model can value, with its missing-input limits
   visible. Label cooldown estimates as assumptions about additional casts. Do not imply the model predicts a
   different rotation, survival, or phase transition.
5. Complete gear-derived damage buckets and validate them against runs with meter stat values. This is necessary
   to make honing/accessory recommendations broadly useful without requiring a successful reference clear or
   meter stat-value data. Equipment snapshots alone do not supply every required combat input.
6. Add a checkpoint window: user-selected start/end, a damage or DPS target, and observed versus estimated damage
   inside exactly that window. Load timed hits on demand from the local database; retain coverage and missing-data
   flags. Whole-fight stat sensitivities must not be described as measured sensitivities for a burst window.
7. Add group-shortfall reporting only when the same window's group damage/required damage is available. A personal
   upgrade contributes its extra damage to the shortfall; it does not scale the entire group's damage. Validate boss
   HP interpretation around shields, healing, transitions, and non-player damage before deriving targets from it.

## Acceptance checks

- A failed attempt can be imported and selected without any Bible clear or a snapshot request succeeding.
- With unchanged gear, estimated damage equals observed damage; missing calibration never becomes a 0% benefit.
- Snapshot failures leave a usable attempt, with an explicit equipment choice rather than a silent current-build match.
- Switching attempts does not carry an unconfirmed baseline or checkpoint target into another run.
- A checkpoint calculation uses only hits in its window, shows coverage, and excludes damage after its end.
- A failed attempt ending before the chosen checkpoint cannot produce a claimed pass by extrapolation.
- Personal and group damage targets have distinct units and results; unsupported upgrades remain unestimated.
- Old imported summaries still open; window features request re-import when timing data is unavailable.

Offline experiment: `cache/dps-failed-pull-feasibility.mjs`. This script reads existing database copies, uses Vite in
middleware mode without opening a listening server, and changes no application behavior.

## Implementation follow-up, 10-21

Implemented locally on `dps-sim/v0` after approval:

- Mathi's raw v3 response adapter, fixed-host request, cache sharing, raw-field preservation and browser cache versioning.
- Import clears/failed pulls/all attempts, with a bounded number of recent attempts; failed attempts appear in DPS mode.
- Missing snapshots require explicit equipment confirmation. Similar CP is no longer described as verified gear.
- A standalone stat engine has no log dependency. It calculates exact ratios under configured additive buckets,
  expected crit and crit cap, optional explicit crit-to-evolution conversion, and fixed support attack.
- The per-stat form pre-fills main stat, Weapon Power and gem/bracer base attack from the loaded baseline. Other
  combat totals must be supplied explicitly; no complete automatic passive/buff reconstruction is claimed. Inputs
  are scoped by character and baseline, and must be enabled again after a baseline change or reload.
- Configured totals can rank supported upgrades by damage and gold efficiency without any imported logs. With an
  attempt selected, those totals can scale its recorded damage; the selected attempt is the only log calibration source.
- A personal checkpoint tool reads a chosen attempt's timeline on demand from a local database, accepts a time window
  and target in million DPS, and shows observed/estimated/target damage and the remaining shortfall. It reports missing
  hit coverage and does not project beyond the recorded attempt. Cooldown cast-count gains and unmodeled build swaps
  are not estimated for fixed windows. Group HP/checkpoint inference is still future work.
- New imports retain Hyper Awakening labels; ordinary stat upgrades leave that damage fixed. Older imports should
  be re-imported to retain this metadata.

The stat engine predicts relative damage, not an absolute rotation or DPS without a performance/rotation baseline.
The checkpoint assumes configured combat totals throughout its window. Automatic class/passive/buff reconstruction
and validation against measured per-stat values remain necessary before describing this as an automatic build analyzer.
