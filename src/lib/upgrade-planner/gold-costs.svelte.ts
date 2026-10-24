// Gold costs players enter for Next Upgrades rows. Kept per upgrade key in this browser and
// shared by every character except skin quotes, which belong to a character. Ranking uses gold per 1% Combat Power.

import { PLENTY, type MaterialOwned, type MaterialPrices } from './honing-cost';
import type { Upgrade, UpgradeCategory } from './upgrades';
import { accessoryPriceKey } from './accessory-sets';
import { marketForCharacter, type MarketRegion, type MarketSnapshot } from '$lib/market-prices';

const KEY = 'loa-sim:gold-costs';
const PRICES_KEY = 'loa-sim:material-prices';
const MODE_KEY = 'loa-sim:upgrade-rank';
const BOOKS_KEY = 'loa-sim:book-prices';

export type RankMode = 'cp' | 'gold';

function read(): Record<string, number> {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return v && typeof v === 'object' ? v : {};
	} catch {
		return {};
	}
}

/** Shared between the sidebar card and the All Upgrades dialog. Filled on first use in the browser. */
export const gold = $state<{
	costs: Record<string, number>;
	prices: MaterialPrices;
	europePrices: MaterialPrices;
	marketSources: Partial<Record<MarketRegion, MarketSnapshot>>;
	/** Bound honing mats per character key. */
	bound: Record<string, MaterialOwned>;
	pricesAt: number | null;
	/** Gold per relic engraving book, by engraving id; shared within each region. */
	bookPrices: Record<string, number>;
	europeBookPrices: Record<string, number>;
	mode: RankMode;
	loaded: boolean;
}>({
	costs: {},
	prices: {},
	europePrices: {},
	marketSources: {},
	bound: {},
	pricesAt: null,
	bookPrices: {},
	europeBookPrices: {},
	mode: 'cp',
	loaded: false
});

export function loadGold() {
	if (gold.loaded || typeof localStorage === 'undefined') return;
	gold.costs = read();
	try {
		const p = JSON.parse(localStorage.getItem(PRICES_KEY) ?? 'null');
		if (p && typeof p.prices === 'object') {
			gold.prices = p.prices;
			// Older versions shared one price list across regions. Seed both once, then keep edits separate.
			gold.europePrices = p.europePrices ?? { ...p.prices };
			gold.marketSources = p.marketSources ?? {};
			gold.bound = p.bound ?? {};
			gold.pricesAt = p.at ?? null;
		}
	} catch {
		/* none yet */
	}
	try {
		const b = JSON.parse(localStorage.getItem(BOOKS_KEY) ?? '{}');
		if (b && typeof b === 'object') {
			gold.bookPrices = b.prices ?? b;
			gold.europeBookPrices = b.europePrices ?? { ...gold.bookPrices };
		}
	} catch {
		/* none yet */
	}
	try {
		gold.mode = localStorage.getItem(MODE_KEY) === 'gold' ? 'gold' : 'cp';
	} catch {
		/* default */
	}
	gold.loaded = true;
}


const skinPricePrefix = (characterKey: string) => `character-skin:${encodeURIComponent(characterKey)}:`;

/** Shared market quotes plus only this character's skin prices. Legacy shared skin quotes are excluded. */
export function costsForCharacter(characterKey: string): Record<string, number> {
	const costs: Record<string, number> = {};
	const prefix = skinPricePrefix(characterKey);
	for (const [key, value] of Object.entries(gold.costs)) {
		if (key.startsWith(prefix)) costs[key.slice(prefix.length)] = value;
		else if (!key.startsWith('character-skin:') && !key.startsWith('skin:')) costs[key] = value;
	}
	return costs;
}

export function setGoldCost(key: string, cost: number | null, characterKey = '') {
	key = accessoryPriceKey(key, {});
	if (key.startsWith('skin:')) key = skinPricePrefix(characterKey) + key;
	if (key.startsWith('accset:')) for (const candidate of Object.keys(gold.costs)) {
		if (candidate !== key && accessoryPriceKey(candidate, {}) === key) delete gold.costs[candidate];
	}
	if (cost === null) delete gold.costs[key];
	else gold.costs[key] = cost;
	try {
		localStorage.setItem(KEY, JSON.stringify(gold.costs));
	} catch {
		/* storage blocked: lasts for this visit */
	}
}

export type ClearedPrices = { costs: Record<string, number>; bookPrices: Record<string, number>; characterKey?: string };

/** Clear saved quotes for a section, keeping the removed entries for Undo. */
export function clearUpgradePrices(category: UpgradeCategory, accessoryFamily?: 'neck' | 'ear' | 'finger', characterKey = '') {
	const cleared: ClearedPrices = { costs: {}, bookPrices: {}, characterKey };
	const prefixes: Partial<Record<UpgradeCategory, string[]>> = {
		accessory: ['accset:', 'accessory:'], skin: [skinPricePrefix(characterKey)], engraving: ['engraving:'], gem: ['gem:'], karma: ['karma:']
	};
	for (const key of Object.keys(gold.costs)) {
		if (!prefixes[category]?.some((prefix) => key.startsWith(prefix))) continue;
		if (accessoryFamily && !key.split(':')[1]?.startsWith(accessoryFamily)) continue;
		cleared.costs[key] = gold.costs[key];
		delete gold.costs[key];
	}
	if (category === 'engraving') {
		const books = bookPricesFor(characterKey);
		cleared.bookPrices = { ...books };
		for (const id of Object.keys(books)) delete books[id];
	}
	try {
		localStorage.setItem(KEY, JSON.stringify(gold.costs));
		if (category === 'engraving') saveBookPrices();
	} catch {
		/* storage blocked: lasts for this visit */
	}
	return cleared;
}

/** Restore cleared entries without overwriting prices entered since the clear. */
export function restoreUpgradePrices(cleared: ClearedPrices) {
	for (const [key, value] of Object.entries(cleared.costs)) {
		if (gold.costs[key] === undefined) gold.costs[key] = value;
	}
	const books = bookPricesFor(cleared.characterKey);
	for (const [key, value] of Object.entries(cleared.bookPrices)) {
		if (books[key] === undefined) books[key] = value;
	}
	try {
		localStorage.setItem(KEY, JSON.stringify(gold.costs));
		if (Object.keys(cleared.bookPrices).length) saveBookPrices();
	} catch {
		/* storage blocked: lasts for this visit */
	}
}

function saveMaterials() {
	gold.pricesAt = Date.now();
	try {
		localStorage.setItem(PRICES_KEY, JSON.stringify({ prices: gold.prices, europePrices: gold.europePrices, marketSources: gold.marketSources, bound: gold.bound, at: gold.pricesAt }));
	} catch {
		/* storage blocked: lasts for this visit */
	}
}

/** Gold per unit for a honing material (null clears it). */
export const materialPricesFor = (characterKey = '') => marketForCharacter(characterKey) === 'euc' ? gold.europePrices : gold.prices;

export function setMaterialPrice(id: string, price: number | null, characterKey = '') {
	const prices = materialPricesFor(characterKey);
	if (price === null) delete prices[id];
	else prices[id] = price;
	saveMaterials();
}

export function clearMaterialPrices(characterKey = ''): MaterialPrices {
	const cleared = { ...materialPricesFor(characterKey) };
	if (marketForCharacter(characterKey) === 'euc') gold.europePrices = {};
	else gold.prices = {};
	saveMaterials();
	return cleared;
}

export function restoreMaterialPrices(cleared: MaterialPrices, characterKey = '') {
	const prices = materialPricesFor(characterKey);
	for (const [id, price] of Object.entries(cleared)) {
		if (prices[id] === undefined) prices[id] = price;
	}
	saveMaterials();
}

export interface MarketImportUndo {
	characterKey: string;
	before: MaterialPrices;
	imported: MaterialPrices;
	booksBefore: Record<string, number>;
	booksImported: Record<string, number>;
	source?: MarketSnapshot;
}

/** Import only returned materials and books; unavailable items keep the player's existing price. */
export function applyMarketPrices(snapshot: MarketSnapshot, characterKey: string): MarketImportUndo {
	const region = marketForCharacter(characterKey);
	if (snapshot.region !== region) throw new Error('The market region does not match this character.');
	const prices = materialPricesFor(characterKey);
	const books = bookPricesFor(characterKey);
	const entries = Object.entries(snapshot.quotes);
	const imported = Object.fromEntries(entries.filter(([id]) => !id.startsWith('book:')).map(([id, quote]) => [id, quote.price]));
	const booksImported = Object.fromEntries(entries.filter(([id]) => id.startsWith('book:')).map(([id, quote]) => [id.slice(5), quote.price]));
	const undo = { characterKey, before: { ...prices }, imported, booksBefore: { ...books }, booksImported, source: gold.marketSources[region] };
	Object.assign(prices, imported);
	Object.assign(books, booksImported);
	gold.marketSources[region] = snapshot;
	saveMaterials();
	saveBookPrices();
	return undo;
}

/** Keep manual edits made after the import, including explicit free prices. */
export function undoMarketPrices(undo: MarketImportUndo) {
	const prices = materialPricesFor(undo.characterKey);
	for (const [id, imported] of Object.entries(undo.imported)) {
		if (prices[id] !== imported) continue;
		if (undo.before[id] === undefined) delete prices[id];
		else prices[id] = undo.before[id];
	}
	const books = bookPricesFor(undo.characterKey);
	for (const [id, imported] of Object.entries(undo.booksImported)) {
		if (books[id] !== imported) continue;
		if (undo.booksBefore[id] === undefined) delete books[id];
		else books[id] = undo.booksBefore[id];
	}
	gold.marketSources[marketForCharacter(undo.characterKey)] = undo.source;
	saveMaterials();
	saveBookPrices();
}

/** A character's bound units of a honing material, used before buying; PLENTY for "plenty". */
export function setMaterialBound(characterKey: string, id: string, amount: number | null) {
	const mine = (gold.bound[characterKey] ??= {});
	if (!amount) delete mine[id];
	else mine[id] = amount;
	saveMaterials();
}

export type ClearedMaterialInventory = { characterKey: string; owned: MaterialOwned };

export function clearMaterialInventory(characterKey: string): ClearedMaterialInventory {
	const cleared = { characterKey, owned: { ...gold.bound[characterKey] } };
	delete gold.bound[characterKey];
	saveMaterials();
	return cleared;
}

export function restoreMaterialInventory(cleared: ClearedMaterialInventory) {
	const mine = (gold.bound[cleared.characterKey] ??= {});
	for (const [id, amount] of Object.entries(cleared.owned)) {
		if (mine[id] === undefined) mine[id] = amount;
	}
	saveMaterials();
}

/** Bound amount as typed: "12k", "3,000" are counts; "∞" / "inf" / "all" mean plenty. */
export function parseOwned(text: string): number | null {
	const t = text.trim().toLowerCase();
	if (!t || /^0+$/.test(t)) return 0;
	if (['∞', 'inf', 'infinite', 'all', 'plenty'].includes(t)) return PLENTY;
	const n = parseGold(t);
	return n === null ? null : Math.min(n, PLENTY);
}

/** Gold per relic book of an engraving (null clears it). */
export const bookPricesFor = (characterKey = '') => marketForCharacter(characterKey) === 'euc' ? gold.europeBookPrices : gold.bookPrices;

function saveBookPrices() {
	try {
		localStorage.setItem(BOOKS_KEY, JSON.stringify({ prices: gold.bookPrices, europePrices: gold.europeBookPrices }));
	} catch {
		/* storage blocked: lasts for this visit */
	}
}

export function setBookPrice(engraving: number, price: number | null, characterKey = '') {
	const prices = bookPricesFor(characterKey);
	if (price === null) delete prices[engraving];
	else prices[engraving] = price;
	saveBookPrices();
}

/** Book rows cost price per book × books read, once that engraving's book price is set. */
export const bookCost = (u: Upgrade, bookPrices: Record<string, number>) =>
	u.books && bookPrices[u.books.engraving] !== undefined ? bookPrices[u.books.engraving] * u.books.count : undefined;

export function setRankMode(mode: RankMode) {
	gold.mode = mode;
	try {
		localStorage.setItem(MODE_KEY, mode);
	} catch {
		/* default next time */
	}
}

const UNITS: Record<string, number> = { '': 1, k: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, million: 1e6 };

/** "45k", "5.5m", "5.5 million", "45,000", "45000 gold" → gold; null for empty or unreadable input. */
export function parseGold(text: string): number | null {
	// "300k0": typed in front of a field's old 0, the stray trailing zeros after the unit are dropped.
	const plain = text.trim().toLowerCase().replaceAll(',', '').replace(/\s*(gold|g)$/, '').replace(/([a-z])0+$/, '$1');
	const m = plain.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);
	if (!m || !(m[2] in UNITS)) return null;
	const n = Number(m[1]) * UNITS[m[2]];
	return n > 0 ? Math.round(n) : null;
}

/** Like parseGold, but 0 is a valid price (materials you already own). */
export function parsePrice(text: string): number | null {
	if (/^\s*0+(\.0+)?\s*$/.test(text)) return 0;
	const plain = text.trim().replaceAll(',', '');
	if (/^\d*\.\d+$/.test(plain)) return Number(plain); // fractions, e.g. 0.3 gold per shard
	return parseGold(text);
}

export function formatGold(g: number): string {
	if (g >= 1e6) return `${+(g / 1e6).toFixed(2)}m`;
	if (g >= 1e3) return `${+(g / 1e3).toFixed(g >= 1e5 ? 0 : 1)}k`;
	return `${Math.round(g)}`;
}

/** Ark Grid rolls remain CP suggestions without a predictable gold cost. */
export const supportsGoldCost = (u: Upgrade) => u.category !== 'core' && u.category !== 'astrogem';

/** Honing (incl. the bracer) and quality are priced from materials, never typed: no material cost = no price to ask for. */
const materialPriced = (u: Upgrade) => u.category === 'honing' || u.category === 'quality';

/** Count price entries, sharing identical accessory quotes across paired slots. Costs are the resolved row totals. */
export function missingPriceCount(upgrades: Upgrade[], costs: Record<string, number>): number {
	return new Set(upgrades.filter((u) => supportsGoldCost(u) && !materialPriced(u) && costs[u.key] === undefined)
		.map((u) => u.books ? `book:${u.books.engraving}` : accessoryPriceKey(u.key, {}))).size;
}

/** Equipment honing is priced from materials; old manually entered totals no longer override it. */
export const manualGoldCost = (u: Upgrade, costs: Record<string, number>) => materialPriced(u) ? undefined : costs[accessoryPriceKey(u.key, costs)];

/** Gold per 1% Combat Power (lower is better); null without a cost or a gain. */
export const goldPerPct = (u: Upgrade, costs: Record<string, number>) => {
	if (!supportsGoldCost(u)) return null;
	const cost = costs[accessoryPriceKey(u.key, costs)];
	return cost !== undefined && u.gainPct > 0 ? cost / u.gainPct : null;
};

/** Priced upgrades, most efficient first. */
export const byGold = (upgrades: Upgrade[], costs: Record<string, number>) =>
	upgrades
		.map((u) => ({ u, per: goldPerPct(u, costs) }))
		.filter((x): x is { u: Upgrade; per: number } => x.per !== null)
		.sort((a, b) => a.per - b.per)
		.map((x) => x.u);
