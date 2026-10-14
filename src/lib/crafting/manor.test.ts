import { describe, expect, it } from 'vitest';
import { defaultManor, manorTotals, suggestManor } from './manor';
import { calculateCraft } from './calculate';
import { FUSION_RECIPES } from './data';

describe('manor effects', () => {
	it('reproduces the screenshot: 7% general + 10% special = 17%, 4310 gold for ten crafts', () => {
		const setup = defaultManor();
		setup.structures = ['card-flipping', 'acrobat', 'glass-sheep'];
		setup.outfits = ['payla-vern', 'thirain-heir', 'nia-basic'];
		setup.baseCost = 4;
		setup.baseTime = 16; // 6% other general + 10% aura, alongside Thirain's 2% and structures' 3%.
		const totals = manorTotals(setup, 'Special');
		expect(totals.general.cost).toBe(7);
		expect(totals.specific.cost).toBe(10);
		expect(totals.cost).toBe(17);
		const result = calculateCraft(FUSION_RECIPES.find((r) => r.product.id === '6861013')!, { crafts: 10, costReduction: totals.cost, timeReduction: totals.time, greatSuccess: 0 }, {}, {});
		expect(result.craftingGold).toBe(4310);
		expect(result.batches).toBe(1);
		expect(result.minutes).toBe(59.25);
	});
	it('applies category effects only to that craft category', () => {
		const setup = defaultManor();
		setup.structures = ['card-flipping', 'acrobat', 'glass-sheep'];
		setup.outfits = ['vivian-lady', 'thirain-heir', 'nia-basic'];
		expect(manorTotals(setup, 'Cooking').cost).toBe(7);
		expect(manorTotals(setup, 'Tools').cost).toBe(5);
		expect(manorTotals(setup, 'Special').cost).toBe(11);
	});
	it('respects active slots and prevents duplicate effects from stacking', () => {
		const setup = defaultManor();
		setup.structures = ['card-flipping', 'card-flipping', 'glass-sheep'];
		setup.slots = 1;
		expect(manorTotals(setup, 'Special').cost).toBe(2);
		setup.slots = 3;
		expect(manorTotals(setup, 'Special').cost).toBe(5);
		setup.baseCost = 100;
		expect(manorTotals(setup, 'Special').general.cost).toBe(30);
	});
	it('suggests the lowest fee from verified effects or from owned effects only', () => {
		const setup = defaultManor();
		setup.baseCost = 4;
		const all = suggestManor(setup, 'Special', 'cost', false);
		expect(manorTotals(all, 'Special').cost).toBe(17);
		setup.owned = ['card-flipping', 'nia-basic'];
		const owned = suggestManor(setup, 'Special', 'cost', true);
		expect([...owned.structures, ...owned.outfits].filter(Boolean).every((id) => setup.owned.includes(id))).toBe(true);
		expect(manorTotals(owned, 'Special').cost).toBe(7);
	});
});
