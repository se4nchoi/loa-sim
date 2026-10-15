# Stronghold crafting

`/crafting` has a searchable workshop catalog with category tabs, recipe-variant chips, a separate favorites area, and saved selection. The picker lists each product once, with search inside the menu; ingredients stay in the material breakdown. `scripts/bake-crafting-data.mjs` builds `catalog.json` from the public Codex workshop index and detail pages; raw responses are cached. The hand-verified 12 Abidos routes retain their existing save ids in `data.ts`.

## Calculation conventions

- Crafting discounts affect the gold fee, rounded down per craft before multiplying by craft count. Materials are not discounted.
- Material quotes are gold per market bundle (100 for these trade-skill materials). Fusion quotes are gold per item.
- Sales deduct `ceil(price / 20)` per selling unit, except 0–1 gold listings. Refunded deposits are not a second expense.
- Profit values **all consumed materials** at their market price, including owned stock. Cash needed instead buys only shortages, in whole market bundles, plus the crafting fee.
- Leftover purchases remain inventory value; they are shown separately from gold after sale. The comparison against selling owned materials uses their after-fee value and credits leftovers at purchase-market value.
- Great success is off by default. The optional field is an actual probability of double output, not a structure/outfit's relative bonus. Expected output is not guaranteed output.
- Time and profit per hour are for a single queue. The user's Workshop screenshot confirms Abidos batches of up to ten crafts share one timer; other catalog entries explicitly assume one craft per timer until their batch capacities are verified. Manor action-energy reductions are applied per craft.
- Inventory is a planning input and is not consumed when changing recipes. Each alternative is an independent comparison. The region selector is removed; loading an older save carries over the previously selected inventory and prices.
- Bound recipes show costs and optional replacement-value savings, never market-sale profit. Their route comparison ranks known cost per item from lowest to highest. Material exchanges and the contents of selection chests are not modeled.
- Manor equipment applies the appropriate category effects, with separate general (30%) and category-specific (10%) caps. Research and other general bonuses are entered separately. Suggestions optimize gold fee or time among the verified equipment catalog, optionally restricted to owned effects; they do not claim maximum profit from speculative great-success rates.

## Data

Names, item ids and icon names come from the existing `cache/maxroll-items.json` game table, with Codex detail pages filling missing records. Item and structure icons use the official Smilegate CDN. Outfit portraits use their Codex icon URLs because those atlas paths are not exposed on that CDN. The Codex catalog can retain older recipes; player research/unlock availability is not inferred.

Recipe source links are stored on each recipe. Examples:

- [Regular Abidos, Excavating](https://lostarkcodex.com/us/recipe/106861512/)
- [Superior Abidos, Excavating](https://lostarkcodex.com/us/recipe/106861513/)
- [Superior Abidos, Logging](https://lostarkcodex.com/us/recipe/106861113/)
- [Superior Abidos, Mining](https://lostarkcodex.com/sp/recipe/106861213/)

The calculator deliberately starts without market prices or assumed stronghold discounts. No market API is called. Manor structure bonuses for Card-Flipping Game, Acrobat's Waiting Room and Glass Sheep are directly visible in the user's in-game screenshot; outfit records link to their individual sources in `manor.ts`.

## Browser persistence

Recipe selection, favorites, prices, inventory and manor settings save automatically in this browser. A failed storage write shows a warning; inputs remain usable in the open tab. Saved manor equipment is validated by slot type, with duplicates and invalid records removed on load.

## Manor catalog coverage

The catalog contains 3 structures and 19 outfits. The outfits added on 2026-10-15 have source excerpts in `manor-sources.json`: Artisan Urr’s Summer Vacation, Neria’s The Voice of Luterra, Sasha’s Stern Marine Girl, Kaysarr’s The Underground Miner, Anke’s Basic Outfit, and Nineveh’s Cute Maid and Sunshine Maid. Each collection entry shows its modeled effects and links to its source. General crafting bonuses apply across categories; research-only bonuses (such as Sasha’s research energy reduction) are excluded. One outfit per NPC can be equipped or suggested.

This is a verified subset, not the full game catalog. Grenade, bomb, potion and other battle-item effects apply through `battle-types.json`, audited against Codex item tooltip types on 2026-10-15 (`https://lostarkcodex.com/us/item/{id}/`). HP potions and selection chests retain the general Battle Item scope: ambiguous `[4-4]` bonuses are excluded. Known robe/flag/charm/horn, campfire and scarecrow utility items use the Other scope. The manor suggestion target follows the selected recipe automatically. Codex’s estate-object index returned no structure records during this audit, so structure coverage retains the three screenshot-verified entries. Relative great-success bonuses remain separate from the manually entered actual probability.
