import { MARKET_ITEMS, normalizeMarketPrices, type MarketRegion, type MarketSnapshot } from '$lib/market-prices';

const API = 'https://marketdata-api.yrzhao1068589.workers.dev/v1/prices/latest';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<MarketRegion, MarketSnapshot>();
const pending = new Map<MarketRegion, Promise<MarketSnapshot>>();

/** Only two fixed catalogs can be requested. CDN caching plus per-instance coalescing limits upstream calls. */
export async function marketPrices(region: MarketRegion, fetchFn: typeof fetch): Promise<MarketSnapshot> {
	const cached = cache.get(region);
	if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
	const running = pending.get(region);
	if (running) return running;
	const task = (async () => {
		const response = await fetchFn(API, {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ region_slug: region, item_slugs: MARKET_ITEMS.map(item => item.slug) }),
			signal: AbortSignal.timeout(10_000)
		});
		if (!response.ok) throw new Error('Market data is unavailable.');
		const snapshot = normalizeMarketPrices(await response.json(), region);
		cache.set(region, snapshot);
		return snapshot;
	})();
	pending.set(region, task);
	try { return await task; }
	finally { pending.delete(region); }
}
