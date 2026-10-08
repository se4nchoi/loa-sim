import { describe, expect, it } from 'vitest';
import { cpBrackets, cpStanding, digestCdf, formatTop, ownRange, type CpDistribution } from './cp-distribution';
import dist from './fixtures/na-soulshan-cp.json';
import supportDist from './fixtures/na-brushann-cp.json';

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

	it('ranks within a bracket, a merged range and the whole class', () => {
		const own = cpStanding(d, ownRange(1784.17), 1)!;
		expect(own.count).toBe(256);
		expect(own.top(6785)).toBeGreaterThan(own.top(7500));
		// 1770–1790 = the 1770 and 1780 brackets together.
		const wide = cpStanding(d, { from: 1770, to: 1790 }, 1)!;
		expect(wide.count).toBe(865 + 256);
		expect(wide.top(6785)).toBeLessThan(own.top(6785)); // the lower bracket is weaker
		const all = cpStanding(d, null, 1)!;
		expect(all.top(6785)).toBeLessThan(own.top(6785));
	});

	it('lists brackets and handles empty ranges', () => {
		expect(cpBrackets(d, 1)[0]).toBe(1640);
		expect(cpBrackets(d, 1).at(-1)).toBe(1800);
		expect(cpStanding(d, { from: 1500, to: 1510 }, 1)).toBeNull();
	});

	it('formats', () => {
		expect(formatTop(0.05)).toBe('Top <0.1%');
		expect(formatTop(3.14159)).toBe('Top 3.1%');
		expect(formatTop(42.4)).toBe('Top 42%');
		expect(formatTop(0.998)).toBe('Top 1%');
		expect(formatTop(0.854)).toBe('Top 0.85%');
	});

	it('keeps dealers and supports apart', () => {
		const sd = supportDist as unknown as CpDistribution;
		const support = cpStanding(sd, { from: 1750, to: 1760 }, 2)!;
		const dealer = cpStanding(sd, { from: 1750, to: 1760 }, 1)!;
		expect(support.count).toBe(sd.digests['2-1750'].count);
		expect(dealer.count).toBe(sd.digests['1-1750'].count);
		expect(cpStanding(sd, null, 2)!.count).toBe(sd.digests['2-all'].count);
	});
});
