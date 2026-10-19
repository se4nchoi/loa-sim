import type { MarketRegion, MarketSnapshot } from './market-prices';

const CACHE_MS = 10 * 60 * 1000;
const RETRY_MS = 30 * 1000;

/** Reopening the dialog shares the cache, in-flight request, and failure cooldown. */
export function createMarketLoader(fetchFn: typeof fetch = fetch, now: () => number = Date.now) {
	const cached = new Map<MarketRegion, { snapshot: MarketSnapshot; until: number }>();
	const pending = new Map<MarketRegion, Promise<MarketSnapshot>>();
	const failures = new Map<MarketRegion, { retryAt: number; message: string }>();
	return {
		retryAt(region: MarketRegion) { return failures.get(region)?.retryAt ?? 0; },
		async load(region: MarketRegion): Promise<MarketSnapshot> {
			const saved = cached.get(region);
			if (saved && now() < saved.until) return saved.snapshot;
			const failure = failures.get(region);
			if (failure && now() < failure.retryAt) throw new Error(failure.message);
			const running = pending.get(region);
			if (running) return running;
			const task = (async () => {
				try {
					const response = await fetchFn(`/api/market?region=${region}`, { signal: AbortSignal.timeout(15_000) });
					const body = await response.json();
					if (!response.ok) throw new Error(body.message ?? 'Could not load market prices.');
					if (body.region !== region || !body.quotes || !Object.keys(body.quotes).length) throw new Error('No market prices available.');
					cached.set(region, { snapshot: body, until: now() + CACHE_MS });
					failures.delete(region);
					return body as MarketSnapshot;
				} catch (error) {
					const message = error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'SyntaxError'
						? error.message : 'Market prices are unavailable. Try again later.';
					failures.set(region, { retryAt: now() + RETRY_MS, message });
					throw new Error(message);
				}
			})();
			pending.set(region, task);
			try { return await task; }
			finally { pending.delete(region); }
		}
	};
}

export const marketLoader = createMarketLoader();
