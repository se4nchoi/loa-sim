# loa-eff: Upgrade Planner for lostark.bible

A "Next Upgrades" panel for NA/CE Lost Ark characters, built as a drop-in component for
[lostark.bible](https://lostark.bible). It ranks the next steps a player can take (gems, astrogems, ark grid
cores, ability stones, accessory lines, karma) by the Combat Power each one adds, using the same battle point
system as the in-game score.

KR tools like lo4.app get this kind of data from the official KR API. NA has no such API, but lostark.bible
already holds the full loadout, including the per-part battle point breakdown. This reproduces the CP formula
from that breakdown (exactly: 6785.48 = 6785.48) and prices each upgrade against it.

## Run the demo

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173/demo for the offline sample, or search a character on the home page.

```bash
npm test
```

## Layout

- `src/lib/upgrade-planner/` is the component and logic, the part meant for lostark.bible. See [INTEGRATION.md](INTEGRATION.md).
- `src/lib/demo/` and `src/routes/` hold a small SvelteKit app that mimics the character page sidebar.
- `src/lib/server/bible.ts` is the demo loader for live characters.
- `legacy/` has the first standalone prototype (plain HTML simulator).

## About fetching from lostark.bible

lostark.bible's `robots.txt` disallows automated access, and its OAuth API doesn't expose gear. The demo
therefore fetches one character per user request and caches it for 30 minutes. It never crawls. The
intended path is for lostark.bible to host the component itself, where no extra fetching is needed.
