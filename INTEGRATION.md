# Integrating the Upgrade Planner into lostark.bible

This adds a **Next Upgrades** card under the Combat Power card on the character page. It ranks what a
player can improve next (gems, ability stones, accessory lines, ark grid cores, astrogem options,
karma) by how much Combat Power each step adds. It also opens a planner dialog with the full list,
an astrogem evaluator and a honing what-if.

It reads only the loadout object the character page already has. There are no new endpoints,
requests or dependencies.

## What to copy

`src/lib/upgrade-planner/` (everything except `fixtures/` and `*.test.ts`, which are optional):

| File | Purpose |
|---|---|
| `cp.ts` | The CP formula. It's the same calculation as the site's existing `attackTotalMax` aggregation over `battlePoint.parts`. |
| `tables.ts` | Battle-point tables: T3/T4 gems, ark grid cores, astrogem options, engravings × ability stone × relic books, accessory lines, karma. |
| `upgrades.ts` | Builds the ranked list from a loadout; astrogem swap evaluation. |
| `types.ts` | Structural types for the loadout fields used. Swap in the site's own `Loadout` type if preferred. |
| `UpgradePlanner.svelte` | Sidebar card. |
| `UpgradeDialog.svelte`, `AstrogemPanel.svelte`, `WhatIfPanel.svelte` | The dialog and its tabs. |
| `format.ts`, `index.ts` | Helpers and exports. |

Requirements: Svelte 5 (runes) and Tailwind v4, using the site's existing `surface-*` / `accent-*` tokens
plus `green-400`, `red-400` and `amber-300`. The markup reuses the classes of the existing Combat Power card and
Combat Power Breakdown dialog (`rounded-xs bg-surface-900 shadow-sm shadow-neutral-800`,
`divide-neutral-950`, `bg-black/10` headers, `grid-cols-subgrid` rows, `text-surface-300` labels).
The dialog is a native `<dialog>`; swapping it for the site's melt-ui dialog is a mechanical change.

## Wiring (character page sidebar)

Wherever the Combat Power card renders for the ark passive loadout:

```svelte
<script lang="ts">
	import { UpgradePlanner } from '$lib/upgrade-planner';
</script>

{#if loadout.type === 'ark_passive' && loadout.battlePoint}
	<CombatPower {classId} {combatPowerDistribution} {loadout} />
	<UpgradePlanner {loadout} />
{/if}
```

Support loadouts (`battlePoint.isSupport`) show a short "DPS only for now" note.

## How values are computed

- **Every candidate is anchored on the site's own battle-point value for that part**, then moved by the
  table delta. So even if a table is off by a constant somewhere, the *difference* stays right, and the
  current CP is always the site's number.
- The CP gain of changing one part from `a` to `b` is `(1e4 + b) / (1e4 + a) − 1`, since CP is a product.
- Ark grid: cores use the 10/14/17/18/19/20P dealer curves, with ancient +100 from 17P. Astrogem options
  are `floor(totalLevel × {Atk 400, Additional Damage 700, Boss Damage 1000} / 120)`, summed across every
  equipped astrogem.
- Ability stones are scored as a whole stone (two engravings), net of the stone they replace.
- Honing isn't tabled. The what-if tab takes main stat / Weapon Power from the in-game honing preview,
  and the result is exact because CP ∝ √(main stat × Weapon Power).

`planner.test.ts` checks every table against a live NA character (Soulshan): CP 6785.48, all 11 gems,
6 cores, 3 astrogem options, 5 engravings and the accessory lines reproduce exactly.

## Known gaps

- Supports aren't modelled (different score, `combatPower.id === 2`).
- Bracelets, elixirs, transcendence, cards, and honing tables aren't listed as candidates.
- The chaos star "Weapon" core and earring Weapon Power % lines are estimates. bible exposes total weapon
  power but not the flat/% split, so they're marked ≈.
- T3 gems and non-relic engravings are supported by the tables but weren't checked against a live character.
- The astrogem evaluator doesn't check willpower.

## Credits

Core and astrogem coefficients: [Ark Grid Gem Locator](https://github.com/airplaner/lostark-arkgrid-gem-locator-v2)
(MIT, see `THIRD_PARTY_NOTICES.md`). Gem/engraving/accessory/karma values:
[inven 4821/106546](https://www.inven.co.kr/board/lostark/4821/106546).
