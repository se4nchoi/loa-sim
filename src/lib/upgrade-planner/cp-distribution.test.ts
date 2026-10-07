import { describe, expect, it } from 'vitest';
import { cpStandings, digestCdf, formatTop, type CpDistribution } from './cp-distribution';
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

	it('gives a bracket and an all-class standing; higher CP ranks higher', () => {
		const s = cpStandings(d, 1784.17);
		expect(s.map((x) => x.label)).toEqual(['1780–1789', 'all']);
		const [bracket, all] = s;
		expect(bracket.top(6785)).toBeGreaterThan(bracket.top(7500));
		expect(all.top(6785)).toBeLessThan(bracket.top(6785)); // the whole class is weaker than its top bracket
		expect(all.top(6785)).toBeGreaterThan(0);
	});

	it('skips a bracket with no data', () => {
		expect(cpStandings(d, 1500).map((x) => x.label)).toEqual(['all']);
	});

	it('formats', () => {
		expect(formatTop(0.05)).toBe('Top <0.1%');
		expect(formatTop(3.14159)).toBe('Top 3.1%');
		expect(formatTop(42.4)).toBe('Top 42%');
		expect(formatTop(0.998)).toBe('Top 1%');
		expect(formatTop(0.854)).toBe('Top 0.85%');
	});
});
