import { ENGRAVING_ICONS } from './upgrade-planner/game-data';

/** Relic recipe slugs published in loa-buddy's catalog. */
export const MARKET_BOOKS = Object.entries(ENGRAVING_ICONS)
	.filter(([id]) => Number(id) < 1800)
	.map(([id, [, name]]) => ({ id: `book:${id}`, slug: name.toLowerCase().replaceAll("'", '').replaceAll(/[^a-z0-9]+/g, '-'), units: 1 }));

/** loa-buddy lists stones per 100 and shard pouches per pouch. Calculations use gold per unit. */
export const MARKET_ITEMS = [
	{ id: '66110225', slug: 'destiny-leapstone', units: 1 },
	{ id: '66110226', slug: 'great-destiny-leapstone', units: 1 },
	{ id: '66102006', slug: 'destiny-destruction-stone', units: 100 },
	{ id: '66102007', slug: 'destiny-crystallized-destruction-stone', units: 100 },
	{ id: '66102106', slug: 'destiny-guardian-stone', units: 100 },
	{ id: '66102107', slug: 'destiny-crystallized-guardian-stone', units: 100 },
	{ id: '6861012', slug: 'abidos-fusion-material', units: 1 },
	{ id: '6861013', slug: 'superior-abidos-fusion-material', units: 1 },
	{ id: '66111131', slug: 'lavas-breath', units: 1 },
	{ id: '66111132', slug: 'glaciers-breath', units: 1 },
	// Game item descriptions: 66130141 / 142 / 143 contain 1,000 / 2,000 / 3,000 shards.
	{ id: 'shards', slug: 'destiny-shard-pouch-s', units: 1000 },
	{ id: 'shards', slug: 'destiny-shard-pouch-m', units: 2000 },
	{ id: 'shards', slug: 'destiny-shard-pouch-l', units: 3000 },
	{ id: '66112543', slug: 'metallurgy-hellfire-11-14', units: 1 },
	{ id: '66112546', slug: 'tailoring-hellfire-11-14', units: 1 },
	{ id: '66112551', slug: 'metallurgy-hellfire-15-18', units: 1 },
	{ id: '66112552', slug: 'tailoring-hellfire-15-18', units: 1 },
	{ id: '66112553', slug: 'metallurgy-hellfire-19-20', units: 1 },
	{ id: '66112554', slug: 'tailoring-hellfire-19-20', units: 1 },
	...MARKET_BOOKS
] as const;

export type MarketRegion = 'nae' | 'euc';
export const MARKET_NAMES: Record<MarketRegion, string> = { nae: 'NA East', euc: 'EU Central' };
export const marketForCharacter = (key: string): MarketRegion => /^(ce|euc)[/:]/i.test(key) ? 'euc' : 'nae';
export interface MarketQuote { price: number; updatedAt: number; slug: string }
export interface MarketSnapshot { region: MarketRegion; fetchedAt: number; quotes: Record<string, MarketQuote> }
export const MARKET_STALE_MS = 24 * 60 * 60 * 1000;

/** Ignore malformed / unlisted rows, never turn unavailable data into a free material. */
export function normalizeMarketPrices(body: unknown, region: MarketRegion, now = Date.now()): MarketSnapshot {
	if (!Array.isArray(body)) throw new Error('Invalid market response.');
	const quotes: Record<string, MarketQuote> = {};
	for (const row of body) {
		if (!row || typeof row !== 'object' || typeof row.price !== 'number' || !Number.isFinite(row.price) || row.price <= 0
			|| typeof row.timestamp !== 'number' || !Number.isFinite(row.timestamp) || row.timestamp <= 0 || row.timestamp * 1000 > now + 300_000) continue;
		const item = MARKET_ITEMS.find(item => item.slug === row.item_slug);
		if (!item) continue;
		const quote = { price: row.price / item.units, updatedAt: row.timestamp * 1000, slug: item.slug };
		const previous = quotes[item.id];
		// Newest observation first; among equally recent shard pouches choose the cheapest per shard.
		if (!previous || quote.updatedAt > previous.updatedAt || (quote.updatedAt === previous.updatedAt && quote.price < previous.price)) quotes[item.id] = quote;
	}
	if (!Object.keys(quotes).length) throw new Error('No market prices available.');
	return { region, fetchedAt: now, quotes };
}
