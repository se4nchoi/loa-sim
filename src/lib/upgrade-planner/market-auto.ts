// Gold mode ranks honing by material prices. Without them, unpriced materials count as 0 gold and honing looks
// nearly free, so market prices load on their own the first time gold mode needs them (and again once a day).
import { marketPricesEnabled } from '$lib/market-flag';
import { marketLoader } from '$lib/market-client';
import { MARKET_STALE_MS, marketForCharacter, type MarketRegion } from '$lib/market-prices';
import { fillMarketPrices, gold } from './gold-costs.svelte';

/** One attempt per region per page load: a failure falls back to the manual button, never a retry loop. */
const tried = new Set<MarketRegion>();

export async function autoLoadMarketPrices(characterKey: string, now = Date.now(), loader = marketLoader, enabled = marketPricesEnabled): Promise<number> {
	const region = marketForCharacter(characterKey);
	if (!enabled() || tried.has(region)) return 0;
	const source = gold.marketSources[region];
	if (source && now - source.fetchedAt < MARKET_STALE_MS) return 0;
	tried.add(region);
	try {
		return fillMarketPrices(await loader.load(region), characterKey);
	} catch {
		return 0; // Gold mode still works with typed prices; Material Prices shows the error if loaded by hand.
	}
}

/** Tests only. */
export const resetAutoMarket = () => tried.clear();
