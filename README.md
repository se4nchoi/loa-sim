# loa-eff: Combat Power Simulator for lostark.bible

A lo4.app-style Combat Power simulator for NA/CE Lost Ark characters, built as a drop-in component for
[lostark.bible](https://lostark.bible). Load a character, then change:

- **honing** and advanced honing per armor piece and weapon (e.g. Head +21 → +22);
- **accessory lines** per necklace, earring and ring (e.g. high-mid → high-high);
- **gem levels**, **engraving** relic books and ability stone levels;
- **ark grid** core points and astrogem option levels, and **karma**.

Simulated CP, item level and each section's share update as you type. The simulator starts from
lostark.bible's exact number (Soulshan: 6785.48) and applies each edit as a change on top of it.

A "Next Upgrades" card is also included. It lists the best one-step upgrades and has an astrogem evaluator.

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

- `src/lib/upgrade-planner/` holds the components and logic meant for lostark.bible. See [INTEGRATION.md](INTEGRATION.md).
  - `simulate.ts` is the simulator engine; `Simulator.svelte` and `sim/` are its UI.
  - `cp.ts` / `tables.ts` / `honing-data.ts` hold the CP formula and battle point tables.
  - `upgrades.ts` and `UpgradePlanner.svelte` are the "Next Upgrades" card and dialog.
- `src/lib/demo/` and `src/routes/` hold a small SvelteKit app that mimics the character page.
- `src/lib/server/bible.ts` is the demo loader for live characters.
- `scripts/bake-honing.mjs` regenerates the honing table from the game data.
- `legacy/` has the first standalone prototype.

## About fetching from lostark.bible

lostark.bible's `robots.txt` disallows automated access, and its OAuth API doesn't expose gear. The demo
therefore fetches one character per user request and caches it for 30 minutes. It never crawls. The
intended path is for lostark.bible to host the component itself, where no extra fetching is needed.
