import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
describe('market price proxy', () => {
	it('coalesces concurrent fetches, caches per region, and only requests the fixed catalog', async () => {
		const { marketPrices } = await import('./market-prices');
		const fetchFn = vi.fn(async () => new Response(JSON.stringify([{ item_slug: 'destiny-leapstone', price: 13, timestamp: Date.now() / 1000 - 5 }])));
		const [a, b] = await Promise.all([marketPrices('nae', fetchFn), marketPrices('nae', fetchFn)]);
		expect(a).toEqual(b);
		await marketPrices('nae', fetchFn);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		await marketPrices('euc', fetchFn);
		expect(fetchFn).toHaveBeenCalledTimes(2);
		const [url, options] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://marketdata-api.yrzhao1068589.workers.dev/v1/prices/latest');
		expect(JSON.parse(options.body as string)).toMatchObject({ region_slug: 'nae' });
	});
	it('does not cache failures, allowing the next request to retry', async () => {
		const { marketPrices } = await import('./market-prices');
		const fetchFn = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
			.mockResolvedValueOnce(new Response(JSON.stringify([{ item_slug: 'destiny-leapstone', price: 13, timestamp: Date.now() / 1000 - 5 }])));
		await expect(marketPrices('nae', fetchFn)).rejects.toThrow();
		expect((await marketPrices('nae', fetchFn)).quotes['66110225'].price).toBe(13);
	});
	it('rejects unsupported regions before any upstream call and marks failures as non-cacheable', async () => {
		const { GET } = await import('../../routes/api/market/+server');
		const fetchFn = vi.fn();
		await expect(GET({ url: new URL('https://example.com/api/market?region=naw'), fetch: fetchFn } as never)).rejects.toMatchObject({ status: 400 });
		expect(fetchFn).not.toHaveBeenCalled();
		fetchFn.mockResolvedValue(new Response('not json'));
		const response = await GET({ url: new URL('https://example.com/api/market?region=nae'), fetch: fetchFn } as never) as Response;
		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
