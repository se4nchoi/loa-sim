import { describe, expect, it } from 'vitest';
import { cpStandings, defaultStanding, digestCdf, formatTop, type CpDistribution } from './cp-distribution';
import dist from './fixtures/na-soulshan-cp.json';

const d = dist as unknown as CpDistribution;

describe('cp distribution', () => {
	it('cdf runs 0 → 1 and never decreases', () => {
		const all = Object.entries(d.digests).find(([k]) => k.endsWith('-all'))![1];
		expect(digestCdf(all, all.min - 1)).toBe(0);
		expect(digestCdf(all, all.max + 1)).toBe(1);
		let prev = 0;
		for (let x = all.min; x <= all.max; x += 50) {
			const c = digestCdf(all, x);
			expect(c).toBeGreaterThanOrEqual(prev);
			prev = c;
		}
	});

	it('lists brackets high to low, then the whole class; higher CP ranks higher', () => {
		const list = cpStandings(d);
		expect(list[0].label).toBe('1800–1809');
		expect(list.at(-1)!.label).toBe('All item levels');
		const own = defaultStanding(list, 1784.17)!;
		expect(own.label).toBe('1780–1789');
		expect(own.top(6785)).toBeGreaterThan(own.top(7500));
		const all = list.at(-1)!;
		expect(all.top(6785)).toBeLessThan(own.top(6785)); // the whole class is weaker than its top bracket
	});

	it('falls back to the whole class when the bracket has no data', () => {
		expect(defaultStanding(cpStandings(d), 1500)!.label).toBe('All item levels');
	});

	it('formats', () => {
		expect(formatTop(0.05)).toBe('Top <0.1%');
		expect(formatTop(3.14159)).toBe('Top 3.1%');
		expect(formatTop(42.4)).toBe('Top 42%');
		expect(formatTop(0.998)).toBe('Top 1%');
		expect(formatTop(0.854)).toBe('Top 0.85%');
	});
});
