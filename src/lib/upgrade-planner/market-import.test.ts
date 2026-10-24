import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMarketPrices, bookCost, bookPricesFor, clearUpgradePrices, restoreUpgradePrices, setBookPrice, clearMaterialPrices, restoreMaterialPrices, gold, loadGold, materialPricesFor, setMaterialPrice, undoMarketPrices } from './gold-costs.svelte';
import type { Upgrade } from './upgrades';
import type { MarketSnapshot } from '$lib/market-prices';

let storage: Map<string, string>;
const snapshot = (region: 'nae' | 'euc'): MarketSnapshot => ({ region, fetchedAt: Date.now(), quotes: {
	'66110226': { price: region === 'nae' ? 66 : 22, updatedAt: Date.now() - 5000, slug: 'great-destiny-leapstone' },
	shards: { price: 545 / 3000, updatedAt: Date.now() - 5000, slug: 'destiny-shard-pouch-l' }
} });
beforeEach(() => {
	storage = new Map();
	vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
	gold.prices = {}; gold.europePrices = {}; gold.marketSources = {}; gold.bound = {}; gold.loaded = false;
	gold.bookPrices = {}; gold.europeBookPrices = {};
});
afterEach(() => vi.unstubAllGlobals());
describe('market imports and manual prices', () => {
	it('imports per-book prices separately by region, prices remaining books, and restores them after reload', () => {
		const nae = snapshot('nae'); nae.quotes['book:1118'] = { price: 55000, updatedAt: Date.now(), slug: 'grudge' };
		const euc = snapshot('euc'); euc.quotes['book:1118'] = { price: 45000, updatedAt: Date.now(), slug: 'grudge' };
		setBookPrice(1299, 65000, 'na/soulshan');
		applyMarketPrices(nae, 'na/soulshan'); applyMarketPrices(euc, 'ce/example');
		expect(bookPricesFor('na/soulshan')).toEqual({ 1118: 55000, 1299: 65000 });
		expect(bookPricesFor('ce/example')).toEqual({ 1118: 45000 });
		expect(materialPricesFor('na/soulshan')['book:1118']).toBeUndefined();
		const upgrade = { books: { engraving: 1118, count: 3 } } as Upgrade;
		expect(bookCost(upgrade, bookPricesFor('na/soulshan'))).toBe(165000);
		expect(bookCost(upgrade, bookPricesFor('ce/example'))).toBe(135000);
		gold.bookPrices = {}; gold.europeBookPrices = {}; loadGold();
		expect(bookPricesFor('na/soulshan')[1118]).toBe(55000);
		expect(bookPricesFor('ce/example')[1118]).toBe(45000);
	});
	it('undoes imported book prices while preserving later manual edits and the other region', () => {
		setBookPrice(1118, 50000, 'na/soulshan'); setBookPrice(1118, 40000, 'ce/example');
		const imported = snapshot('nae');
		imported.quotes['book:1118'] = { price: 55000, updatedAt: Date.now(), slug: 'grudge' };
		imported.quotes['book:1299'] = { price: 65000, updatedAt: Date.now(), slug: 'adrenaline' };
		const undo = applyMarketPrices(imported, 'na/soulshan');
		setBookPrice(1299, 0, 'na/soulshan'); undoMarketPrices(undo);
		expect(bookPricesFor('na/soulshan')).toEqual({ 1118: 50000, 1299: 0 });
		expect(bookPricesFor('ce/example')).toEqual({ 1118: 40000 });
	});
	it('migrates legacy book prices and clears or restores only the selected region', () => {
		storage.set('loa-sim:book-prices', JSON.stringify({ 1118: 50000 })); loadGold();
		setBookPrice(1118, 40000, 'ce/example');
		const cleared = clearUpgradePrices('engraving', undefined, 'ce/example');
		expect(bookPricesFor('ce/example')).toEqual({});
		expect(bookPricesFor('na/soulshan')).toEqual({ 1118: 50000 });
		restoreUpgradePrices(cleared);
		expect(bookPricesFor('ce/example')).toEqual({ 1118: 40000 });
	});
	it('keeps NA and EU prices separate, preserves unsupported items and bound inventory, and persists both', () => {
		gold.prices = { '66112555': 2000, '66110226': 99 };
		gold.bound = { 'na/soulshan': { '66110226': 3000 } };
		applyMarketPrices(snapshot('nae'), 'na/soulshan');
		applyMarketPrices(snapshot('euc'), 'ce/example');
		expect(materialPricesFor('na/soulshan')).toMatchObject({ '66110226': 66, '66112555': 2000 });
		expect(materialPricesFor('ce/example')['66110226']).toBe(22);
		expect(gold.bound['na/soulshan']['66110226']).toBe(3000);
		gold.prices = {}; gold.europePrices = {}; gold.marketSources = {}; gold.bound = {};
		loadGold();
		expect(materialPricesFor('na/soulshan')['66110226']).toBe(66);
		expect(materialPricesFor('ce/example')['66110226']).toBe(22);
		expect(gold.bound['na/soulshan']['66110226']).toBe(3000);
		expect(gold.marketSources.euc?.quotes.shards.price).toBeCloseTo(545 / 3000);
	});
	it('undo restores earlier manual prices but preserves later edits, including zero', () => {
		gold.prices = { '66110226': 99 };
		const undo = applyMarketPrices(snapshot('nae'), 'na/soulshan');
		setMaterialPrice('shards', 0, 'na/soulshan');
		undoMarketPrices(undo);
		expect(gold.prices).toEqual({ '66110226': 99, shards: 0 });
		expect(gold.marketSources.nae).toBeUndefined();
	});
	it('migrates the legacy shared manual list without dropping EU prices, then separates edits', () => {
		storage.set('loa-sim:material-prices', JSON.stringify({ prices: { '66110226': 99 }, bound: {}, at: 123 }));
		loadGold();
		setMaterialPrice('66110226', 22, 'ce/example');
		expect(gold.prices['66110226']).toBe(99);
		expect(gold.europePrices['66110226']).toBe(22);
	});
	it('rejects a mismatched market without changing prices', () => {
		expect(() => applyMarketPrices(snapshot('euc'), 'na/soulshan')).toThrow();
		expect(gold.prices).toEqual({});
	});
	it('clears and restores only the selected region, keeping newer regional edits', () => {
		applyMarketPrices(snapshot('nae'), 'na/soulshan');
		applyMarketPrices(snapshot('euc'), 'ce/example');
		const cleared = clearMaterialPrices('ce/example');
		expect(materialPricesFor('na/soulshan')['66110226']).toBe(66);
		expect(materialPricesFor('ce/example')).toEqual({});
		setMaterialPrice('66110226', 0, 'ce/example');
		restoreMaterialPrices(cleared, 'ce/example');
		expect(materialPricesFor('ce/example')['66110226']).toBe(0);
		expect(materialPricesFor('ce/example').shards).toBeCloseTo(545 / 3000);
	});
});
