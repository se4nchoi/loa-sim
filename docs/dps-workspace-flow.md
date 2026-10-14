# Simulator → DPS workspace

Simulator owns gear edits, snapshot selection, CP components and CP estimates. DPS Sim reads the selected character and snapshot plus that snapshot's working copy from browser storage. It renders a dedicated analysis page with the saved changes, covered DPS impact by section, skill weights, sample provenance and per-hit experiments when hit data is available.

Working copies use the existing `sim-save` branch's `loa-sim:autosave:v1:<region/name>` format; named plans use `loa-sim:simulations:v1`. Both retain the complete starting loadout. Only plans with an identical baseline are eligible for the current snapshot. An old snapshot's changes are never applied to a new snapshot automatically.

Simulator saves working copies synchronously after valid edits and restores them when returning to the same snapshot. DPS analysis copies the gear state and applies the chosen log's shares/cooldown context to that copy. Choosing a public clear or importing a database updates the per-character log sample, not the saved gear plan. Named plans already present in browser storage can be selected for analysis.

The DPS page refreshes from storage on navigation, window focus, relevant storage events from other tabs, and its Refresh saved data button. Snapshot selection and gear editing happen through the link back to Simulator. Storage is per browser origin; a localhost tab and the deployed site do not share saved data.

The public Shanzkii samples remain rounded marginal estimates with partial skill coverage. The page does not convert recorded nDPS into projected absolute DPS. Unsupported changes remain visible as unestimated.

Upstream integration (October 14): incorporated `main` through `ae76982`, including `sim-save` through `4d3874f`. The Simulator's latest autosave naming, saved-plan selector and input-focus improvements are retained. Its bound simulation state feeds the shared working-copy storage without duplicate autosave effects; DPS log APIs are retained despite the earlier main-branch revert. All 393 tests pass and Svelte reports zero errors/warnings.
