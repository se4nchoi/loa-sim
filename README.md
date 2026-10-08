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

Players load their own character on the home page. They enter a name, open a link to their character's
lostark.bible data, then copy all of it and paste it in. The request comes from the player's own browser (normal
browsing), the data is decoded client-side, and it's saved in their browser so a return visit opens straight
into the simulator. Nothing is uploaded.

To capture current gear, the player sets it up in game, goes to character select (or switches characters), then
presses refresh on their lostark.bible page. In practice that's when a fresh snapshot reaches the site.

### Why not fetch it for them?

lostark.bible's `robots.txt` disallows automated access, its OAuth API doesn't expose gear, and its data has no CORS
headers. So a public deployment must not proxy it. `/character/<region>/<name>` fetches server-side only when
`BIBLE_SERVER_FETCH=1` (see `.env.example`). That's meant for local development, or for after the site owner says
it's fine. Otherwise it redirects to the paste flow with the name filled in.
