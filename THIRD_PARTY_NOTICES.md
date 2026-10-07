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

- Gem, engraving, accessory and karma battle-point values: "딜러 전투력 로직 분석 (25년 7월 9일 패치 반영)",
  https://www.inven.co.kr/board/lostark/4821/106546. Values are game facts, cross-checked against lostark.bible.
- Accessory option values per grade: as shown in game.

## UI frames

- `static/frames/*.png` (ark passive frames and the inherited-gear border) are game UI assets, as used by
  lostark.bible (served there under `/i/`). All game assets belong to Smilegate RPG / Amazon Games.

## Libraries

- [wa-sqlite](https://github.com/rhashimoto/wa-sqlite) (MIT, © Roy T. Hashimoto): SQLite in WebAssembly, used to read
  LOA Logs databases locally.
- The LOA Logs database format follows [snoww/loa-logs](https://github.com/snoww/loa-logs) (GPL-3.0). Only its data
  format is read; no code is copied.
