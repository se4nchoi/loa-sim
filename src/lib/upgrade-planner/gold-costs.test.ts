import { describe, expect, it } from 'vitest';
import { byGold, formatGold, goldPerPct, parseGold } from './gold-costs.svelte';
import type { Upgrade } from './upgrades';

const up = (key: string, gainPct: number) => ({ key, gainPct, category: 'gem', title: key, detail: '', count: 1, approximate: false }) as Upgrade;

describe('gold costs', () => {
	it('reads gold the way players type it', () => {
		expect(parseGold('45k')).toBe(45000);
		expect(parseGold('1.2m')).toBe(1200000);
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
});
