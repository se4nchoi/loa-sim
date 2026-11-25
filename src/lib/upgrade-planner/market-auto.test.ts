import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookPricesFor, fillMarketPrices, gold, materialPricesFor, setMaterialPrice } from './gold-costs.svelte';
import { autoLoadMarketPrices, resetAutoMarket } from './market-auto';
import { MARKET_STALE_MS, type MarketSnapshot } from '$lib/market-prices';

const NA = 'na/soulshan';
const quote = (price: number, slug = 'x') => ({ price, updatedAt: Date.now(), slug });
const snapshot = (quotes: MarketSnapshot['quotes'], fetchedAt = Date.now()): MarketSnapshot => ({ region: 'nae', fetchedAt, quotes });
const loader = (snap: MarketSnapshot | Error) => ({ load: vi.fn(async () => { if (snap instanceof Error) throw snap; return snap; }) });

beforeEach(() => {
	vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
	gold.prices = {}; gold.europePrices = {}; gold.marketSources = {}; gold.bound = {};
	gold.bookPrices = {}; gold.europeBookPrices = {};
	resetAutoMarket();
});
afterEach(() => vi.unstubAllGlobals());

describe('fillMarketPrices', () => {
	it('fills missing prices and keeps typed ones, including 0 for bound', () => {
		setMaterialPrice('66110226', 80, NA);
		setMaterialPrice('6861013', 0, NA);
		const changed = fillMarketPrices(snapshot({ '66110226': quote(66), '6861013': quote(90), shards: quote(0.2), 'book:1118': quote(55000) }), NA);
		expect(materialPricesFor(NA)).toEqual({ '66110226': 80, '6861013': 0, shards: 0.2 });
		expect(bookPricesFor(NA)).toEqual({ 1118: 55000 });
		expect(changed).toBe(2);
	});
	it('refreshes prices that still equal the previous quote, but not ones edited since', () => {
		fillMarketPrices(snapshot({ '66110226': quote(66), shards: quote(0.2) }), NA);
		setMaterialPrice('shards', 0.25, NA);
		fillMarketPrices(snapshot({ '66110226': quote(70), shards: quote(0.3) }), NA);
		expect(materialPricesFor(NA)).toEqual({ '66110226': 70, shards: 0.25 });
	});
	it('ignores a snapshot from the other region', () => {
		expect(fillMarketPrices({ ...snapshot({ '66110226': quote(66) }), region: 'euc' }, NA)).toBe(0);
		expect(materialPricesFor(NA)).toEqual({});
	});
});

describe('autoLoadMarketPrices', () => {
	it('loads once per region per page load', async () => {
		const l = loader(snapshot({ '66110226': quote(66) }));
		expect(await autoLoadMarketPrices(NA, Date.now(), l as never, () => true)).toBe(1);
		await autoLoadMarketPrices(NA, Date.now() + 2 * MARKET_STALE_MS, l as never, () => true);
		expect(l.load).toHaveBeenCalledTimes(1);
	});
	it('skips fresh market data and the disabled flag', async () => {
		const l = loader(snapshot({ '66110226': quote(66) }));
		gold.marketSources.nae = snapshot({}, Date.now() - 1000);
		await autoLoadMarketPrices(NA, Date.now(), l as never, () => true);
		await autoLoadMarketPrices('ce/example', Date.now(), l as never, () => false);
		expect(l.load).not.toHaveBeenCalled();
	});
	it('reloads stale market data and swallows failures', async () => {
		gold.marketSources.nae = snapshot({}, Date.now() - MARKET_STALE_MS - 1);
		const failing = loader(new Error('down'));
		expect(await autoLoadMarketPrices(NA, Date.now(), failing as never, () => true)).toBe(0);
		expect(failing.load).toHaveBeenCalledWith('nae');
	});
});
