# DPS tab: UX review and where to pick up (10-18-26)

Status: 1, 2, 3, 5 and 8 done (10-19); 4, 6, 7, 9, 10 open. Review of the DPS tab (`/dps`, `DpsWorkspace.svelte`) on branch `dps-sim/v0`, done with Soulshan's
logs. Ordered by how much each item helps a player understand the page. Suggested first batch: 1, 2, 5, 8, 3.

## What the numbers mean

1. **Show DPS, not only percentages.** "≈+1.20%" never says of what. Add a headline with the recorded DPS for the
   selected clears ("Your recorded DPS in Horizon Cathedral: 312m average over 12 clears", from `run.damage /
   run.duration`), and show each row as "+1.20% ≈ +3.7m".
2. **Bring back where DPS and CP disagree.** The earlier version had "CP ranks it #9"; the current list lost it. Show a
   small badge ("DPS #3 · CP #9") when the ranks differ by about 3 or more. That disagreement is the reason the tab
   exists.
3. **CP gain in neutral grey.** "CP +0.78%" under each DPS gain uses the dealer-CP red, which reads as a loss.
4. **Rename the source tags.** "Calculated" / "From logs" mean nothing to a player. Use "From your stats" / "From your
   skill damage" with a tooltip, or drop them.

## Noise and dead ends

5. **Hide tabs that lead nowhere.** Ark Grid Cores, Astrogems and Karma have tabs, but none of their rows can be
   estimated yet. Show a category only when it has at least one estimate; put unestimated rows in a folded
   "Not estimated yet" group at the bottom.
6. **Prices.** With 32 missing prices, "Per gold" can't rank anything and most rows say "Price needed".
   `codex/market-api` (pushed, not merged) imports loa-buddy market prices and relic book prices; merging it would fill
   most prices. Until then, one line ("Add prices to rank by gold → Material prices") instead of "Price needed" on
   every row.
7. **Breakdown repeats itself.** For stat upgrades, "By clear" lists the same value for every clear. When all clears
   agree, say "Same in all 12 clears".

## Raid selection

8. **A click on a raid card should switch to it.** Today a click adds the raid to the selection ("Mixed raids"), and the
   only hint is the small "Include / ✓ Included" text. Make a click switch; add a small "+ Compare" on each card for
   mixing raids.
9. **One-line explanation under the header**, e.g. "Upgrades ranked by how much they'd raise your DPS in the raids you
   pick, from your own LOA Logs."

## Logic

10. **Mark rows that depend on the raid.** Only gems (skill shares) and Crit Rate change from raid to raid; every other
    row is identical everywhere. A small "raid-specific" marker explains why changing the raid reorders only some rows.

## Resuming

- Branch `dps-sim/v0` (pushed). Run `npm run dev -- --host --port 5173`, open `/dps`, load a character, then pick
  `encounters.db`: it imports the character's last 8 weeks right away.
- Test data: `cache/dps-real-soulshan.db` (5.9 MB copy from 10-13). The live LOA Logs database is
  `%LOCALAPPDATA%\LOA Logs\encounters.db` (1.3 GB on 10-18); only ever read copies of it.
- Don't copy large files into `static/` while the dev server runs: Vite reloads every open page, and a 1.3 GB file
  crashed its watcher (EBUSY). `vite.config.ts` prebundles wa-sqlite so the first import doesn't reload the page.
- Recent work on this branch (10-18): import on file pick, newest real raid as the default, gems ranked without the
  meter's stat values, Crit Rate falling back to the clears that have it, a reload only when stored data changed, and an
  "Updating…" spinner for that reload. See `docs/dps-workspace-flow.md` for how the page works.
- Also pushed and unmerged: `codex/snapshot-engraving-audit` (storage validation, shared engraving catalog) and
  `codex/market-api` (market price imports).
