# Honing data audit

## Belgardin bracer: KR preview

The existing simulator already includes acquisition, +0–25 honing, and epic → legendary → relic → ancient limit breaks. Its KR tables are in `bracer.ts` and `bracer-cost-data.ts`; expected and pity honing costs include both breath types. Acquisition is free. Limit-break costs are currently excluded from budgeting.

Recorded sources:

- Smilegate, “8월 5일(수) 업데이트 내역 안내”, table “완갑 단계별 재련 성공률과 필요 재료”: https://lostark.game.onstove.com/News/Notice/Views/13508
- LOPEC enhancement calculator: https://www.lopec.kr/tool/enhancement

The repository records stat verification on 2026-10-08 and cost verification on 2026-10-09. A fresh source check on 2026-10-13 was blocked by the cloud proxy (CONNECT 403); no new source verification is claimed. The Maxroll book feed is now accessible and was verified below; a fresh bracer-source audit has not been repeated.

### Global release audit — pending

When Maxroll or live global game data includes the bracer:

- Compare all 25 rows: one-time growth shards, per-tap shards, gold, destruction and guardian stones, leapstones, fusion materials, base success, failure bonus/cap, artisan energy and both breath quantities/rates.
- Compare all 26 stat rows and the grade AP bonuses; verify dealer and support CP against live characters.
- Confirm global item IDs/import shape, grade caps and acquisition rules; replace KR-only detection only after verification.
- Source limit-break material costs separately before including them in budget totals.
- Regenerate from the global feed when supported, retain source dates, run bracer and honing regression tests, and remove the KR preview label only after the audit.

## Pre-Serca books and Serca preparation

Hellfire (Aegir) book data was verified against Maxroll's global planner feed on 2026-10-13:

- https://assets-ng.maxroll.gg/laplanner/game/stats.json — `enhanceMaterial` rows `41050<target>` (weapon), `41051<target>` (armor); effect type 1 is additive chance in 1/10000 units.
- https://assets-ng.maxroll.gg/laplanner/game/items.json — book names, icons, descriptions and bound equivalents. The generator cross-checks each printed bonus against the material effects for both market and bound IDs.

| Target | Ordinary Hellfire bonus | Enhanced bonus |
| --- | --- | --- |
| +11–12 | +10 percentage points | — |
| +13–14 | +5 percentage points | — |
| +15–16 | +4 percentage points | — |
| +17–19 | +3 percentage points | +6 at +19 |
| +20 | +1.5 percentage points | +3 |

Market IDs: weapon 66112543 / 66112551 / 66112553 / 66112555; armor 66112546 / 66112552 / 66112554 / 66112556. The current items feed omits metadata for 66112543, while enhanceMaterial explicitly references it. Its bound counterpart 66112651 supplies its name/icon/printed bonuses; the generator verifies their effects agree at every eligible level. All other market metadata is present directly.

Regenerate only this slice with `node --use-env-proxy scripts/bake-honing-books.mjs` (or provide local stats/items JSON paths). No percentages or ranges are user-configurable. Book rows use the same character-bound inventory and shared market-price storage as other materials. Unset book quotes do not imply unlimited free market books: only entered bound stock is considered until a market price is supplied. A player may include usable roster-bound stock but must update it after spending or exchanging it. The former arbitrary single-book settings are ignored; old quantities cannot be mapped safely to the three level-specific book families.

The estimator compares no consumables and each full-quantity initial-run combination of breath and one eligible book, then stops at its chosen cutoff. Regular and enhanced books are mutually exclusive on a tap. Combined items share a cutoff. This is a bounded strategy comparison, not a global optimum across arbitrary per-tap decisions. Books are not spent on an already guaranteed tap; final chance is capped at 100%. The existing artisan-energy model is retained.

Reported savings compare with no books; market break-even compares with the best strategy requiring no purchased books, including bound-only strategies. Strategy comparisons also report average gold and first-tap success probability. Multi-step budgets consume expected bound quantities (the existing approximation); individual recommendations each assume the full saved stock is available.

Hellfire books are gated to Aegir gear and their sourced target levels; they never apply to Serca or bracers. The catalog schema also supports Serca for future work, but no Serca rows are enabled. Before adding them, verify their identities, exact additive rates, target ranges, artisan interaction, exchanges and character/roster/trade bindings. Do not assume Belgardin exchange inventory is owned.
