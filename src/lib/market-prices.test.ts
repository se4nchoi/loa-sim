import { describe, expect, it } from 'vitest';
import { marketForCharacter, normalizeMarketPrices } from './market-prices';

const now = 1_800_000_000_000;
const row = (item_slug: string, price: unknown, timestamp = now / 1000 - 100) => ({ item_slug, price, timestamp });
describe('loa-buddy price conversion', () => {
	it('converts stone bundles, single items and shard pouch contents to per-unit gold', () => {
		const { quotes } = normalizeMarketPrices([
			row('destiny-crystallized-destruction-stone', 2982), row('great-destiny-leapstone', 66),
			row('destiny-shard-pouch-s', 184), row('destiny-shard-pouch-m', 575), row('destiny-shard-pouch-l', 545),
			row('metallurgy-hellfire-19-20', 1748)
		], 'nae', now);
		expect(quotes['66102007'].price).toBe(29.82);
		expect(quotes['66110226'].price).toBe(66);
		expect(quotes.shards.price).toBeCloseTo(545 / 3000);
		expect(quotes.shards.slug).toBe('destiny-shard-pouch-l');
		expect(quotes['66112553'].price).toBe(1748);
	});
	it('uses newer observations before comparing pouch prices and preserves old observation dates', () => {
		const { quotes } = normalizeMarketPrices([
			row('destiny-shard-pouch-s', 10, now / 1000 - 100_000), row('destiny-shard-pouch-l', 600),
			row('destiny-leapstone', 13, now / 1000 - 200_000)
		], 'euc', now);
		expect(quotes.shards.price).toBe(0.2);
		expect(quotes['66110225'].updatedAt).toBe(now - 200_000_000);
	});
	it('rejects invalid values without inventing zero prices or accepting arbitrary item ids', () => {
		const { quotes } = normalizeMarketPrices([
			row('destiny-leapstone', 13), row('great-destiny-leapstone', 0), row('lavas-breath', null),
			row('glaciers-breath', '23'), row('abidos-fusion-material', -1), row('__proto__', 10),
			row('superior-abidos-fusion-material', Infinity), row('destiny-guardian-stone', 100, now / 1000 + 3600)
		], 'nae', now);
		expect(Object.keys(quotes)).toEqual(['66110225']);
		expect(() => normalizeMarketPrices({ prices: [] }, 'nae', now)).toThrow();
		expect(() => normalizeMarketPrices([row('destiny-leapstone', 0)], 'nae', now)).toThrow();
	});
	it('matches both character key formats to supported markets', () => {
		expect(marketForCharacter('na/soulshan')).toBe('nae');
		expect(marketForCharacter('ce:example')).toBe('euc');
		expect(marketForCharacter('CE/example')).toBe('euc');
	});
});
