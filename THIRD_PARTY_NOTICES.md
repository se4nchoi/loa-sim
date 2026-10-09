# Third-party notices

## Ark Grid Gem Locator (airplaner/lostark-arkgrid-gem-locator-v2)

The ark grid core curves and astrogem option coefficients in `src/lib/upgrade-planner/tables.ts`
(`dealerCoreCurve`, `coreValue`, `ASTROGEM_COEFF`) are adapted from
https://github.com/airplaner/lostark-arkgrid-gem-locator-v2 under this license:

```
Copyright 2026 Airplaner

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

This license applies only to the source code and original content created by the author.
All game-related assets are property of their respective owners.

```

## Other data

- Item icons/names, astrogem kinds and the bracelet effect catalog with its Combat Power weights
  (`src/lib/upgrade-planner/game-data.ts`), from the same feed. Icons are loaded from the official game CDN
  (`cdn-lostark.game.onstove.com`), the same URLs the KR Open API returns.
- Honing tables (`src/lib/upgrade-planner/honing-data.ts`): main stat / Weapon Power by honing and advanced
  honing level for T4 1675 gear, from the game's item tables as published in Maxroll's planner data feed
  (`assets-ng.maxroll.gg/laplanner/game/stats.json`). Regenerate both with `node scripts/bake-game-data.mjs`.

- Honing costs (`src/lib/upgrade-planner/honing-cost-data.ts`): success chances, failure bonus, breath, artisan's
  energy, and gold / silver / shards / materials per tap for T4 Serca and Aegir gear, from the game's item and
  enhance tables in the same Maxroll planner feed. Game facts; the cost model in `honing-cost.ts` is our own.

- Bracer (완갑) honing costs (`src/lib/upgrade-planner/bracer-cost-data.ts`): success rate, growth shards and
  per-tap materials / gold by step, from Smilegate's KR patch notice "8월 5일(수) 업데이트 내역 안내",
  https://lostark.game.onstove.com/News/Notice/Views/13508. The failure bonus and breath amounts the notice
  leaves out are KR game facts as listed in LOPEC's enhancement calculator (https://www.lopec.kr/tool/enhancement),
  whose table matches the notice's figures; only those numbers are used, not LOPEC's code.

- Gem, engraving, accessory and karma battle-point values: "딜러 전투력 로직 분석 (25년 7월 9일 패치 반영)",
  https://www.inven.co.kr/board/lostark/4821/106546. Values are game facts, cross-checked against lostark.bible.
- Accessory option values per grade: as shown in game.

## Sidereal data

- Sidereal item metadata, evolution item levels, Weapon Power and advanced honing tables are game facts
  from the cached Maxroll planner feed. Regenerate with `node scripts/bake-game-data.mjs`, which also runs
  `scripts/bake-sidereal-data.mjs`. Elgic III's folded advanced honing was cross-checked against the public
  NA/Mira character snapshot on 2026-10-08; its +8 weapon is item level 1775 with advancedHoning 40.

## UI frames

- `static/frames/*.png` (ark passive frames and the inherited-gear border) are game UI assets, as used by
  lostark.bible (served there under `/i/`). All game assets belong to Smilegate RPG / Amazon Games.
- `static/classes/*.png` (class emblems) are game assets copied from lostark.bible's `/i/classes/`.
- `static/bible/artist_cry.png` is lostark.bible's logo, used to label the roster synced from lostark.bible.

## Libraries

- [wa-sqlite](https://github.com/rhashimoto/wa-sqlite) (MIT, © Roy T. Hashimoto): SQLite in WebAssembly, used to read
  LOA Logs databases locally.
- The LOA Logs database format follows [snoww/loa-logs](https://github.com/snoww/loa-logs) (GPL-3.0). Only its data
  format is read; no code is copied. The raid / gate grouping of boss names (`src/lib/logs/raids.ts`) follows its
  encounter list (`src/lib/constants/encounters.ts`): the names as facts, re-typed into our own structure.
