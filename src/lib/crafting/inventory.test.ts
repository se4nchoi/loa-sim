import { describe, expect, it } from 'vitest';
import { CRAFT_MATERIALS, DEFAULT_CRAFT_MATERIAL_GROUPS, inventoryDisplayMaterials, inventoryGroups, inventoryMaterials, inventoryValue } from './inventory';
import { defaultCraftSave } from './storage';
import { calculateCraft } from './calculate';
import { PATHS, RECIPES } from './data';

describe('shared crafting inventory', () => {
	it('opens with the usual fusion and battle-item materials without adding saved stock or prices', () => {
		const market = defaultCraftSave().markets.NA;
		const rows = inventoryDisplayMaterials(market);
		const ids = new Set(rows.map(material => material.id));
		expect(DEFAULT_CRAFT_MATERIAL_GROUPS.map(group => group.name)).toEqual(['Foraging', 'Logging', 'Mining', 'Hunting', 'Fishing', 'Excavating']);
		expect(rows).toHaveLength(23);
		expect(ids.size).toBe(rows.length);
		for (const material of PATHS.flatMap(path => path.materials)) expect(ids.has(material.id)).toBe(true);
		for (const recipe of RECIPES.filter(recipe => recipe.category === 'Battle Item' && recipe.tradeable !== false)) {
			for (const { material } of recipe.ingredients.filter(({ material }) => material.id.startsWith('688') && material.grade <= 2)) expect(ids.has(material.id)).toBe(true);
		}
		expect(market).toEqual({ owned: {}, prices: {} });
		expect(inventoryValue(market)).toEqual({ gold: 0, unpriced: 0 });
	});
	it('keeps cleared default rows visible and preserves saved extra materials without duplicates', () => {
		const market = defaultCraftSave().markets.NA;
		const extra = CRAFT_MATERIALS.find(material => !inventoryDisplayMaterials(market).some(row => row.id === material.id))!;
		market.owned[extra.id] = 50;
		market.owned['6882301'] = 500;
		market.prices['6882301'] = 100;
		expect(inventoryDisplayMaterials(market)).toHaveLength(24);
		expect(inventoryGroups(market).at(-1)).toEqual({ name: 'Other materials', materials: [extra] });
		delete market.owned['6882301'];
		delete market.prices['6882301'];
		expect(inventoryDisplayMaterials(market).filter(material => material.id === '6882301')).toHaveLength(1);
		expect(market.owned[extra.id]).toBe(50);
		expect(market.prices['6882301']).toBeUndefined();
	});
	it('lists saved ingredients once across recipes and excludes sale-only products', () => {
		const market = defaultCraftSave().markets.NA;
		market.owned['6882301'] = 0;
		market.prices['6882301'] = 100;
		market.prices['6861013'] = 150;
		expect(inventoryMaterials(market).map(material => material.id)).toEqual(['6882301']);
		expect(new Set(CRAFT_MATERIALS.map(material => material.id)).size).toBe(CRAFT_MATERIALS.length);
	});
	it('values stock by market bundle and keeps missing quotes distinct from zero', () => {
		const market = defaultCraftSave().markets.NA;
		market.owned = { '6882301': 250, '6882304': 20, '6884308': 10 };
		market.prices = { '6882301': 120, '6882304': 0 };
		expect(inventoryValue(market)).toEqual({ gold: 300, unpriced: 1 });
	});
	it('shares stock between regular and superior recipes without consuming inventory', () => {
		const craft = defaultCraftSave();
		craft.markets.NA.owned['6882301'] = 100;
		const counts = ['6861012:logging', '6861013:logging'].map(id => {
			const recipe = RECIPES.find(recipe => recipe.id === id)!;
			return calculateCraft(recipe, craft.settings, craft.markets.NA.prices, craft.markets.NA.owned).lines[0];
		});
		expect(counts.map(line => line.used)).toEqual([86, 100]);
		expect(counts.map(line => line.shortage)).toEqual([0, 12]);
		expect(craft.markets.NA.owned['6882301']).toBe(100);
	});
});
