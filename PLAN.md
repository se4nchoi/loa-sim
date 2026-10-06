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

## Tonight's work (in order)

1. [ ] Scaffold SvelteKit + Svelte 5 + Tailwind v4 + Skeleton v3 to match bible's stack; copy bible's surface/accent tokens.
2. [ ] `lib/upgrade-planner/cp.ts`: formula and types mirroring bible's `battlePoint` shape.
3. [ ] `lib/upgrade-planner/tables.ts`: gems, cores, astrogems, engravings, accessories, karma, with sources.
4. [ ] `lib/upgrade-planner/upgrades.ts`: build the candidate list from a loadout, with ΔCP% for each.
5. [ ] Vitest: CP formula, every table reproduces the Soulshan fixture, upgrade deltas sane.
6. [ ] `UpgradePlanner.svelte` (sidebar card styled like bible's "Combat Power" card) and `UpgradePlannerDialog.svelte` (full list, filters, gold inputs, astrogem section).
7. [ ] Demo app: `/character/[region]/[name]` route using the single-request cached fetcher; test against Soulshan in the browser, desktop and mobile.
8. [ ] `INTEGRATION.md` for the bible admin, README, credits (MIT notice for the astrogem tables).
9. [ ] Local git history with clean commits so it reads like a PR.
