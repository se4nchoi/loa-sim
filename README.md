# loa-sim: Combat Power Simulator for lostark.bible

A lo4.app-style Combat Power simulator for NA/CE Lost Ark characters, built as a drop-in component for
[lostark.bible](https://lostark.bible). Load a character, then change:

- **honing** and advanced honing per armor piece and weapon (e.g. Head +21 → +22);
- **Sidereal weapons**, when equipped: evolution, Elgic infusion I–III;
- **accessories:** each line (in lostark.bible's High/Mid/Low colors, with every alternative's CP change shown) and
  the main stat, to compare against accessories on the market;
- **bracelet:** combat stats and effects, scored with the game's own weights for all 136 bracelet effects;
- **gem levels**, **engraving** relic books and ability stone levels;
- **ark grid:** every astrogem's core points and options (willpower is checked), and **karma**.

Simulated CP, item level and each section's share (in % and raw CP) update as you type. Item icons come from the
official game CDN. The simulator starts from
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
- `scripts/bake-game-data.mjs` regenerates the honing table, icons and bracelet catalog from the game data.
- `legacy/` has the first standalone prototype.

## Sidereal weapons and region preferences

The selected region is remembered in localStorage. An explicit region in a reload link takes precedence.

Sidereal owners can adjust evolution and Elgic infusion.

## Loading a character

Players load their own character on the home page, three ways:

- **Sign in with lostark.bible** (OAuth, Authorization Code + PKCE). The app reads the player's linked rosters and
  lists their characters; picking one loads it. The token stays in the player's browser for its 90 days.
- **Load by name**: type a name (or bible link) and press Load.
- **Paste**: open the character's lostark.bible data link, copy all of it and paste it in (the fallback).

Loading goes through this app's server (`/api/character/<region>/<name>`): browsers can't fetch bible's character
data themselves (no CORS), and bible's OAuth API has no gear yet. lostark.bible's developer has OK'd fetching it
server-side, one character per player action; the server caches each character for a few minutes and shares one
request between simultaneous loads. Set `BIBLE_SERVER_FETCH=0` to turn it off (see `.env.example`); players then
paste instead. Either way the data is decoded and saved in the player's browser, so a return visit opens straight
into the simulator.

To capture current gear, the player sets it up in game, goes to character select (or switches characters), then
reloads the character. In practice that's when a fresh snapshot reaches lostark.bible.

OAuth redirect URIs registered with lostark.bible: `https://loa-sim.vercel.app` (production client) and
`http://localhost:5173/oauth-test` (development client; `/oauth-test` also hosts a dev-only API inspector).
