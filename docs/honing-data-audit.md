# Honing data audit

## Belgardin bracer: KR preview

The existing simulator already includes acquisition, +0–25 honing, and epic → legendary → relic → ancient limit breaks. Its KR tables are in `bracer.ts` and `bracer-cost-data.ts`; expected and pity honing costs include both breath types. Acquisition is free. Limit-break costs are currently excluded from budgeting.

Recorded sources:

- Smilegate, “8월 5일(수) 업데이트 내역 안내”, table “완갑 단계별 재련 성공률과 필요 재료”: https://lostark.game.onstove.com/News/Notice/Views/13508
- LOPEC enhancement calculator: https://www.lopec.kr/tool/enhancement

The repository records stat verification on 2026-10-08 and cost verification on 2026-10-09. A fresh source check on 2026-10-13 was blocked by the cloud proxy (CONNECT 403); no new source verification is claimed. Source-domain additions were saved in the environment draft and still require application.

### Global release audit — pending

When Maxroll or live global game data includes the bracer:

- Compare all 25 rows: one-time growth shards, per-tap shards, gold, destruction and guardian stones, leapstones, fusion materials, base success, failure bonus/cap, artisan energy and both breath quantities/rates.
- Compare all 26 stat rows and the grade AP bonuses; verify dealer and support CP against live characters.
- Confirm global item IDs/import shape, grade caps and acquisition rules; replace KR-only detection only after verification.
- Source limit-break material costs separately before including them in budget totals.
- Regenerate from the global feed when supported, retain source dates, run bracer and honing regression tests, and remove the KR preview label only after the audit.

## Pre-Serca books and Serca preparation

Aegir book settings use the player's printed additive success bonus and eligible target-level range. No book rate, item ID, exchange price, binding rule or eligibility range is fabricated. Market prices are shared; bound quantities use the existing per-character inventory. A player may include usable roster-bound stock but must update it after spending or exchanging it.

The estimator compares no consumables and each full-quantity initial-run combination of breath/book consumables, then stops at its chosen cutoff. Combined items share a cutoff. This is a bounded strategy comparison, not a global optimum across arbitrary per-tap decisions. Books are not spent on an already guaranteed tap; final chance is capped at 100%. Added success contributes to artisan energy using the existing honing model. Re-audit this interaction against authoritative book rules before adding a fixed catalog.

Reported savings compare with no books; the market break-even compares with the best strategy requiring no purchased books, including bound-only strategies. Multi-step budgets consume expected bound quantities (the existing approximation); individual recommendations each assume the full saved stock is available.

The engine accepts separately gated `serca:weapon` / `serca:armor` rules for future work, but the UI only configures Aegir. Before enabling Serca, verify global/KR book identities, exact additive rates, target ranges, artisan interaction, exchanges and character/roster/trade bindings. Do not automatically apply Aegir books to Serca or assume Belgardin exchange inventory is owned.
