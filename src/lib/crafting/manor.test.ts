import { describe, expect, it } from 'vitest';
import { defaultManor, manorTotals, suggestManor } from './manor';
import { calculateCraft } from './calculate';
import { FUSION_RECIPES, RECIPES, craftingScope } from './data';

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
	it('uses the expanded cooking and tool outfits only in their matching categories', () => {
		const setup = defaultManor();
		setup.outfits = ['neria-luterra', 'anke-basic', 'kaysarr-miner'];
		expect(manorTotals(setup, 'Cooking')).toMatchObject({ cost: 2, time: 4, energy: 0 });
		expect(manorTotals(setup, 'Tools')).toMatchObject({ cost: 1, time: 0, energy: 0 });
		expect(manorTotals(setup, 'Structure')).toMatchObject({ cost: 0, time: 4, energy: 2 });
		expect(manorTotals(setup, 'Special')).toMatchObject({ cost: 0, time: 0, energy: 0 });
	});
	it('keeps general success bonuses separate from actual great-success probability', () => {
		const setup = defaultManor();
		setup.outfits = ['urr-summer', 'nineveh-cute', 'sasha-marine'];
		expect(manorTotals(setup, 'Special')).toMatchObject({ time: 3, energy: 1, successBonus: 3 });
	});
	it('cannot stack Nineveh outfits, including in externally supplied setups', () => {
		const setup = defaultManor();
		setup.outfits = ['nineveh-cute', 'nineveh-sunshine', 'urr-summer'];
		expect(manorTotals(setup, 'Special')).toMatchObject({ time: 3, successBonus: 3 });
		setup.owned = ['nineveh-cute', 'nineveh-sunshine', 'urr-summer'];
		const suggestion = suggestManor(setup, 'Special', 'time', true);
		expect(suggestion.outfits.filter((id) => id.startsWith('nineveh-'))).toHaveLength(1);
		expect(manorTotals(suggestion, 'Special').time).toBe(3);
	});
	it('finds the improved fastest structure setup without losing ownership constraints', () => {
		const setup = defaultManor();
		const all = suggestManor(setup, 'Structure', 'time', false);
		expect(manorTotals(all, 'Structure').time).toBe(8);
		setup.owned = ['kaysarr-miner', 'sasha-marine'];
		const owned = suggestManor(setup, 'Structure', 'time', true);
		expect(manorTotals(owned, 'Structure').time).toBe(4);
		expect([...owned.structures, ...owned.outfits].filter(Boolean).every((id) => setup.owned.includes(id))).toBe(true);
	});

	it('applies grenade, bomb and potion bonuses only to the audited item type', () => {
		const setup = defaultManor();
		setup.outfits = ['neria-battlefield', 'krissa-specialist', 'ezrebet-basic'];
		for (const [id, scope, cost] of [['101221', 'Battle Item - Grenade', 4], ['101912', 'Battle Item - Bomb', 4], ['101181', 'Battle Item - Potion', 1]] as const) {
			const recipe = RECIPES.find((r) => r.product.id === id)!;
			expect(craftingScope(recipe)).toBe(scope);
			expect(manorTotals(setup, scope).cost).toBe(cost);
		}
		expect(manorTotals(setup, 'Special').cost).toBe(0);
		expect(craftingScope(RECIPES.find((r) => r.product.id === '101061')!)).toBe('Battle Item');
	});
	it('changes the lowest-cost suggestion with the selected crafting category', () => {
		const setup = defaultManor();
		for (const [scope, item] of [['Special', 'payla-vern'], ['Cooking', 'vivian-lady'], ['Battle Item - Grenade', 'neria-battlefield'], ['Battle Item - Bomb', 'krissa-specialist'], ['Battle Item - Other', 'poppy-engineer']] as const) {
			expect(suggestManor(setup, scope, 'cost', false).outfits).toContain(item);
		}
	});

});
