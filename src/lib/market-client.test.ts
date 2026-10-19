import { describe, expect, it, vi } from 'vitest';
import { createMarketLoader } from './market-client';

const snapshot = (region = 'nae') => ({ region, fetchedAt: 123, quotes: { '66110226': { price: 66, updatedAt: 123, slug: 'great-destiny-leapstone' } } });
describe('market request controls', () => {
	it('reuses successful results for 10 minutes without blocking reimport', async () => {
		let now = 1000;
		const fetchFn = vi.fn(async () => Response.json(snapshot()));
		const loader = createMarketLoader(fetchFn, () => now);
		await Promise.all([loader.load('nae'), loader.load('nae')]);
		await loader.load('nae');
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(loader.retryAt('nae')).toBe(0);
		now += 10 * 60 * 1000;
		await loader.load('nae');
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});
	it('waits 30 seconds after a failure, then permits retry, independently per region', async () => {
		let now = 1000;
		const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ message: 'Unavailable' }, { status: 502 }))
			.mockResolvedValueOnce(Response.json(snapshot('euc'))).mockResolvedValueOnce(Response.json(snapshot()));
		const loader = createMarketLoader(fetchFn, () => now);
		await expect(loader.load('nae')).rejects.toThrow('Unavailable');
		expect(loader.retryAt('nae')).toBe(31_000);
		await expect(loader.load('nae')).rejects.toThrow('Unavailable');
		expect(fetchFn).toHaveBeenCalledTimes(1);
		await loader.load('euc');
		now = 31_000;
		await loader.load('nae');
		expect(fetchFn).toHaveBeenCalledTimes(3);
		expect(loader.retryAt('nae')).toBe(0);
	});
	it('treats malformed success responses as failures, rather than importing empty or wrong-region data', async () => {
		const fetchFn = vi.fn(async () => Response.json(snapshot('euc')));
		const loader = createMarketLoader(fetchFn, () => 1000);
		await expect(loader.load('nae')).rejects.toThrow('No market prices available');
		expect(loader.retryAt('nae')).toBe(31_000);
	});
});
