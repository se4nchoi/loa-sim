# loa-eff: Upgrade Planner for lostark.bible

Goal: a "Next upgrades" panel for lostark.bible character pages that ranks the upgrades a player can
work towards (gems, astrogems/ark grid cores, engravings, accessories, karma) by the Combat Power they
add. It's packaged so the site owner can drop it in with minimal friction.

## What's unclear (and the default I'm going with)

| # | Question | Default taken tonight |
|---|---|---|
| 1 | lostark.bible has **no public repo** (closed source, by the LOA Logs author). There's nothing to open a PR against. | Ship a self-contained `src/lib/upgrade-planner/` folder (pure TS logic + Svelte 5 components using bible's own Tailwind v4 / Skeleton v3 classes), a demo SvelteKit app that mimics the character page, and `INTEGRATION.md` describing a ~10-line wiring. You (or I, drafted) send it to the admin via their Discord. |
| 2 | "Return for gold" without NA market data. | Rank by **CP % gained**. Each row has an optional gold field (saved in the browser) and, once filled, ranks by % per 100k gold. No made-up NA prices. |
| 3 | Which upgrades count as "next"? | One step per system: gem +1 level, each astrogem option +1 level, each core to its next breakpoint (17/18/19/20P), engraving stone +1 / relic books +5, accessory line to high grade, karma +1. Honing and bracelet go in a manual "what-if" editor (the tables aren't reliable enough yet). |
| 4 | Supports | Out of scope. Bible scores supports differently (`isSupport`, CP id 2). The panel shows a "dealers only for now" note. |
| 5 | Language | English UI (bible is English). KR source names are kept in code comments for traceability. |
| 6 | Data access | The component takes the **loadout object bible already has** on the page, so there's no extra fetching on their side. My demo fetches one character at a time (cached), because robots.txt disallows bots. |

## Verified facts (all reproduce Soulshan's bible numbers exactly)

- CP = base ÷ 1e4 × Π(1 + part ÷ 1e4); base = 2.88 × √(mainStat × weaponPower ÷ 6) × (1 + atk% ÷ 100).
- T4 gems Lv1–10: 128…704 (+64/level). T3: 48…480, 640.
- Ark grid cores: dealer table + ancient +100 at 17P+; chaos sun/moon have two tiers. Source: airplaner/lostark-arkgrid-gem-locator-v2 (MIT).
- Astrogem options: floor(totalLevel × {atk 400, add-dmg 700, boss 1000} ÷ 120).
- Engraving tables by ability stone level × relic books, accessory and karma coefficients. Source: inven 4821/106546.

## Tonight's work: done

1. [x] SvelteKit 2 + Svelte 5 + Tailwind v4 scaffold with lostark.bible's surface/accent tokens and Geist font.
   (Kit 3 / Vite 8 were tried first; bible's hydration code is Kit 2, so it's pinned to that.)
2. [x] `cp.ts`: formula and types mirroring bible's `battlePoint`.
3. [x] `tables.ts`: gems, cores, astrogems, engravings, accessories, karma, each with a cited source.
4. [x] `upgrades.ts`: ranked candidates, ability stones scored as whole stones, astrogem swap evaluator.
5. [x] 19 Vitest tests; every table reproduces the Soulshan fixture exactly.
6. [x] `UpgradePlanner.svelte` card plus `UpgradeDialog` (Upgrades / Astrogems / Honing What-If tabs).
7. [x] Demo app: `/demo` (offline) and `/character/NA/<name>` (single cached lookup). Checked in the browser at
   desktop and phone widths.
8. [x] `INTEGRATION.md`, `README.md`, `THIRD_PARTY_NOTICES.md`.
9. [x] Local git history in PR-sized commits.

## Changes of approach along the way

- The astrogem locator link you sent supplied the exact core and astrogem curves (MIT). All 6 of Soulshan's cores
  match, including a chaos "second tier" core that the inven tables alone didn't explain.
- Ability stones started as per-engraving "+1 stone level" rows, which was misleading: a stone holds two
  engravings. They're now scored as whole stones (10/10, 10/9, 9/9, 10/7), net of the current stone.
- An astrogem's "worth" counts its options only. Emptying any socket drops the core below 17P, so a full
  removal made every gem look alike.

## Next (needs your call)

- [ ] Send INTEGRATION.md to the lostark.bible admin (Discord), or decide to host the demo ourselves first.
- [ ] Supports (bible's support score, `combatPower.id === 2`).
- [ ] Honing candidates: needs weapon power / main stat per honing level tables for current gear.
- [ ] Bracelet rerolls, elixir/transcendence for older gear.
- [ ] Willpower check in the astrogem evaluator.
- [ ] Optional rough NA gold presets, if you want defaults instead of blank gold fields.
