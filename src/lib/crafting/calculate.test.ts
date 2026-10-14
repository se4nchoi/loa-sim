import { describe, expect, it } from 'vitest';
import { RECIPES, FUSION_RECIPES } from './data';
import { calculateCraft, minimumSellPrice, saleFee, type CraftSettings } from './calculate';

const recipe = RECIPES.find((r) => r.id === '6861013:excavating')!;
const settings: CraftSettings = { crafts: 1, costReduction: 0, timeReduction: 0, greatSuccess: 0 };
const [common, uncommon, rare] = recipe.ingredients.map((i) => i.material.id);
const prices = { [common]: 100, [uncommon]: 200, [rare]: 1000, [recipe.product.id]: 150 };

describe('stronghold crafting', () => {
	it('uses the verified regular and superior recipe quantities across all six paths', () => {
		expect(FUSION_RECIPES).toHaveLength(12);
		for (const r of FUSION_RECIPES) {
			const superior = r.product.id === '6861013';
			expect(r.ingredients.map((i) => i.quantity)).toEqual(superior ? [112, 59, 43] : [86, 45, 33]);
			expect(r.gold).toBe(superior ? 520 : 400);
			expect(r.output).toBe(10);
		}
	});
	it('covers the workshop catalog and never reports market sale profit for bound output', () => {
		expect(RECIPES.length).toBeGreaterThan(350);
		expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
		for (const r of RECIPES) {
			expect(r.ingredients.every((i) => i.quantity > 0 && !i.material.name.startsWith('Item '))).toBe(true);
			expect(r.minutes).toBeGreaterThan(0);
		}
		const bound = RECIPES.find((r) => r.tradeable === false)!;
		const quotes = Object.fromEntries([...bound.ingredients.map((i) => [i.material.id, 100]), [bound.product.id, 500]]);
		expect(calculateCraft(bound, settings, quotes, {}).profit).toBeNull();
	});
	it('rounds the market fee per item, not once per craft', () => {
		expect(saleFee(1)).toBe(0);
		expect(saleFee(2)).toBe(1);
		expect(saleFee(20)).toBe(1);
		expect(saleFee(21)).toBe(2);
		expect(saleFee(150)).toBe(8);
		const r = calculateCraft(recipe, settings, prices, {});
		expect(r.revenue).toBe(1420);
		expect(r.materialValue).toBe(660);
		expect(r.profit).toBe(240);
		expect(r.unitCost).toBe(118);
		expect(r.breakEven).toBe(125);
	});
	it('buys whole market bundles and exposes leftovers separately from material value', () => {
		const r = calculateCraft(recipe, settings, prices, { [common]: 110, [uncommon]: 59 });
		expect(r.lines.map((l) => l.shortage)).toEqual([2, 0, 43]);
		expect(r.lines.map((l) => l.purchased)).toEqual([100, 0, 100]);
		expect(r.lines.map((l) => l.leftover)).toEqual([98, 0, 57]);
		expect(r.cashNeeded).toBe(1620);
		expect(r.cashAfterSale).toBe(-200);
		expect(r.profit).toBe(240);
	});
	it('does not count owned materials as free profit', () => {
		const owned = { [common]: 1120, [uncommon]: 590, [rare]: 430 };
		const r = calculateCraft(recipe, settings, prices, owned);
		expect(r.cashNeeded).toBe(520);
		expect(r.profit).toBe(240);
		expect(r.maxOwnedCrafts).toBe(10);
		expect(r.vsSelling).toBeCloseTo(273);
	});
	it('discounts only the gold fee and rounds per craft, not on the batch total', () => {
		const r = calculateCraft(recipe, { ...settings, crafts: 3, costReduction: 11.1 }, prices, {});
		expect(r.goldPerCraft).toBe(462);
		expect(r.craftingGold).toBe(1386);
		expect(r.materialValue).toBe(1980);
	});
	it('keeps missing prices unknown even when owned stock covers every ingredient', () => {
		const owned = { [common]: 112, [uncommon]: 59, [rare]: 43 };
		const r = calculateCraft(recipe, settings, { [recipe.product.id]: 150 }, owned);
		expect(r.cashNeeded).toBe(520);
		expect(r.profit).toBeNull();
		expect(r.breakEven).toBeNull();
		expect(r.missing).toHaveLength(3);
	});
	it('accepts an explicitly zero-priced material and handles missing sale price', () => {
		const r = calculateCraft(recipe, settings, { [common]: 0, [uncommon]: 0, [rare]: 0 }, {});
		expect(r.totalCost).toBe(520);
		expect(r.revenue).toBeNull();
		expect(r.profit).toBeNull();
	});
	it('uses explicit great-success probability as expected double output, not extra guaranteed crafts', () => {
		const r = calculateCraft(recipe, { ...settings, greatSuccess: 5, timeReduction: 20 }, prices, {});
		expect(r.output).toBe(10);
		expect(r.expectedOutput).toBe(10.5);
		expect(r.revenue).toBe(1491);
		expect(r.minutes).toBe(60);
	});
	it('finds the smallest break-even listing even at fee boundaries', () => {
		for (const cost of [0, 1, 1.1, 19, 20, 118, 119.2, 990]) {
			const p = minimumSellPrice(cost);
			expect(p - saleFee(p)).toBeGreaterThanOrEqual(cost);
			if (p > 0) expect(p - 1 - saleFee(p - 1)).toBeLessThan(cost);
		}
	});
	it('uses one timer per ten fusion crafts, with a second timer for the eleventh', () => {
		expect(calculateCraft(recipe, { ...settings, crafts: 10 }, prices, {}).minutes).toBe(75);
		expect(calculateCraft(recipe, { ...settings, crafts: 11 }, prices, {}).minutes).toBe(150);
	});
});
