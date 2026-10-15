import { PATHS, RECIPES, type CraftMaterial } from './data';
import type { CraftMarket } from './storage';

/** Use game item ids so every recipe reads the same stock and bundle quote. */
export const CRAFT_MATERIALS: CraftMaterial[] = [...new Map(RECIPES.flatMap(recipe => recipe.ingredients.map(({ material }) => [material.id, material] as const))).values()]
	.sort((a, b) => a.name.localeCompare(b.name));

// Rare battle-item materials alongside the common/uncommon and Abidos materials in each fusion path.
const BATTLE_RARE: Record<string, string> = { Foraging: '6882107', Logging: '6884307', Mining: '6884407', Hunting: '6885505', Excavating: '6885705' };
export const DEFAULT_CRAFT_MATERIAL_GROUPS = PATHS.map(path => {
	const battleRare = CRAFT_MATERIALS.find(material => material.id === BATTLE_RARE[path.name]);
	return { name: path.name, materials: [...path.materials.slice(0, 2), ...(battleRare ? [battleRare] : []), ...path.materials.slice(2)] };
});
const DEFAULT_IDS = new Set(DEFAULT_CRAFT_MATERIAL_GROUPS.flatMap(group => group.materials.map(material => material.id)));

/** Default rows are presentation only: opening or clearing the inventory never invents a saved quote. */
export function inventoryGroups(market: CraftMarket) {
	const extra = inventoryMaterials(market).filter(material => !DEFAULT_IDS.has(material.id));
	return [...DEFAULT_CRAFT_MATERIAL_GROUPS, ...(extra.length ? [{ name: 'Other materials', materials: extra }] : [])];
}

export const inventoryDisplayMaterials = (market: CraftMarket) => inventoryGroups(market).flatMap(group => group.materials);

/** Distinguish materials sharing a display name, such as farm and tradable timber. */
export const materialUsage = (id: string) => [...new Set(RECIPES.filter(recipe => recipe.ingredients.some(ingredient => ingredient.material.id === id)).map(recipe => recipe.category ?? recipe.path))].join(' · ');

export function inventoryMaterials(market: CraftMarket): CraftMaterial[] {
	return CRAFT_MATERIALS.filter(material => market.owned[material.id] !== undefined || market.prices[material.id] !== undefined);
}

export function inventoryValue(market: CraftMarket) {
	let gold = 0;
	let unpriced = 0;
	for (const material of inventoryMaterials(market)) {
		const quantity = market.owned[material.id] ?? 0;
		if (quantity <= 0) continue;
		const quote = market.prices[material.id];
		if (quote === undefined) unpriced++;
		else gold += quantity * quote / material.bundle;
	}
	return { gold, unpriced };
}
