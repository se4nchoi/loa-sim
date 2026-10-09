import { describe, expect, it } from 'vitest';
import { bookCost, byGold, formatGold, goldPerPct, parseGold, parseOwned } from './gold-costs.svelte';
import type { Upgrade } from './upgrades';

const up = (key: string, gainPct: number) => ({ key, gainPct, category: 'gem', title: key, detail: '', count: 1, approximate: false }) as Upgrade;

describe('gold costs', () => {
	it('excludes Ark Grid suggestions from gold efficiency even with old saved prices', () => {
		const core = { ...up('core:1:20', 1), category: 'core' as const };
		const astrogem = { ...up('astrogem:2001', 0.5), category: 'astrogem' as const };
		const gem = up('gem:4:9', 0.25);
		const costs = { [core.key]: 100, [astrogem.key]: 100, [gem.key]: 10000 };
		expect(goldPerPct(core, costs)).toBeNull();
		expect(goldPerPct(astrogem, costs)).toBeNull();
		expect(byGold([core, astrogem, gem], costs)).toEqual([gem]);
	});
	it('reads gold the way players type it', () => {
		expect(parseGold('45k')).toBe(45000);
		expect(parseGold('1.2m')).toBe(1200000);
		expect(parseGold('5.5m')).toBe(5500000);
		expect(parseGold('5.5 million')).toBe(5500000);
		expect(parseGold('5.5mil')).toBe(5500000);
		expect(parseGold('45 thousand')).toBe(45000);
		expect(parseGold('45k gold')).toBe(45000);
		expect(parseGold('45000g')).toBe(45000);
		expect(parseGold('5.5 bananas')).toBeNull();
		expect(parseGold(' 45,000 ')).toBe(45000);
		expect(parseGold('850')).toBe(850);
		expect(parseGold('')).toBeNull();
		expect(parseGold('abc')).toBeNull();
		expect(parseGold('0')).toBeNull();
	});

	it('formats gold compactly', () => {
		expect(formatGold(850)).toBe('850');
		expect(formatGold(45000)).toBe('45k');
		expect(formatGold(38250)).toBe('38.3k');
		expect(formatGold(250000)).toBe('250k');
		expect(formatGold(1250000)).toBe('1.25m');
	});

	it('ranks priced upgrades by gold per 1% CP, cheapest first', () => {
		const a = up('a', 1.0); // 100k for 1% → 100k per 1%
		const b = up('b', 0.5); // 20k for 0.5% → 40k per 1%
		const c = up('c', 2.0); // unpriced
		const costs = { a: 100000, b: 20000 };
		expect(goldPerPct(b, costs)).toBe(40000);
		expect(goldPerPct(c, costs)).toBeNull();
		expect(byGold([a, b, c], costs).map((u) => u.key)).toEqual(['b', 'a']);
	});

	it('reads bound amounts, with ∞ meaning plenty', () => {
		expect(parseOwned('0')).toBe(0);
		expect(parseOwned('')).toBe(0);
		expect(parseOwned('3,000')).toBe(3000);
		expect(parseOwned('12k')).toBe(12000);
		expect(parseOwned('∞')).toBe(1e12);
		expect(parseOwned('9999999999')).toBe(9999999999);
		expect(parseOwned('99999')).toBe(99999);
		expect(parseOwned('lots')).toBeNull();
	});

	it('prices engraving book rows as price per book × books read', () => {
		const u = { ...up('engraving:1255:books:5', 1), books: { engraving: 1255, name: 'Mass Increase', count: 5 } } as Upgrade;
		expect(bookCost(u, {})).toBeUndefined();
		expect(bookCost(u, { 1255: 80000 })).toBe(400000);
		expect(bookCost(up('gem:T4:9', 1), { 1255: 80000 })).toBeUndefined();
	});
});
