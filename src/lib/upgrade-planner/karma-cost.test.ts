import { describe, expect, it } from 'vitest';
import { autoHoningCosts } from './honing-cost';
import { KARMA_COSTS } from './karma-cost-data';

const costs = (keys: string[], evolution = 0) => autoHoningCosts(keys, {}, {}, {}, { evolution });

describe('Karma gold costs with unlimited Destiny Stones', () => {
	it('prices unlocking each tree as one guaranteed try', () => {
		for (const tree of ['evolution-level', 'enlightenment', 'leap']) {
			const c = costs([`karma:${tree}:1`])[`karma:${tree}:1`];
			expect(c).toMatchObject({ expected: 1100, worst: 1100, taps: 1, maxTaps: 1, breath: false });
		}
	});
	it('uses constant success chance and forces success after exactly ten 10% pity fills', () => {
		const c = costs(['karma:leap:2'])['karma:leap:2'];
		expect(c.maxTaps).toBe(11);
		expect(c.worst).toBe(9900);
		expect(c.taps).toBeCloseTo((1 - 0.8 ** 11) / 0.2, 10);
		expect(c.expected).toBeCloseTo(c.taps * 900, 8);
	});
	it('rounds a partial final pity fill up, without an extra failure', () => {
		const c = costs(['karma:enlightenment:3'])['karma:enlightenment:3'];
		expect(c.maxTaps).toBe(15); // 14 failures at 7.5%, then guaranteed success
		expect(c.taps).toBeCloseTo((1 - 0.85 ** 15) / 0.15, 10);
	});
	it('handles the very low chance at level 29 to 30', () => {
		const c = costs(['karma:leap:30'])['karma:leap:30'];
		expect(c.maxTaps).toBe(1251); // 1250 failures at 0.08%
		expect(c.worst).toBe(1251 * 900);
		expect(c.taps).toBeCloseTo((1 - 0.9975 ** 1251) / 0.0025, 8);
	});
	it('sums only the remaining levels to the next Evolution rank', () => {
		const c = costs(['karma:evolution:2'], 3)['karma:evolution:2']; // Lv. 3 -> 5
		const levels = costs(['karma:evolution-level:4', 'karma:evolution-level:5']);
		for (const field of ['expected', 'worst', 'taps', 'maxTaps'] as const)
			expect(c[field]).toBeCloseTo(levels['karma:evolution-level:4'][field] + levels['karma:evolution-level:5'][field], 8);
	});
	it('requires the current Evolution level for a rank bundle and rejects invalid rows', () => {
		expect(autoHoningCosts(['karma:evolution:2'], {}, {})).toEqual({});
		expect(costs(['karma:unknown:3', 'karma:leap:31', 'karma:leap:0', 'karma:leap:2.5', 'karma:evolution:7', 'karma:evolution:1'], 5)).toEqual({});
	});
	it('covers every valid transition in all trees with positive success and pity fill', () => {
		for (const rows of Object.values(KARMA_COSTS)) {
			expect(rows).toHaveLength(30);
			for (const row of rows.slice(1)) {
				expect(row.success).toBeGreaterThan(0);
				expect(row.meter).toBeGreaterThan(0);
				expect(row.gold).toBe(900);
			}
		}
	});
});
