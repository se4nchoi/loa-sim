// Gold costs players enter for Next Upgrades rows (NA has no market API). Kept per upgrade key in this browser and
// shared by every character, so "T4 gem Lv. 7 → 8" is priced once. Ranking by gold uses gold per 1% Combat Power.

import { PLENTY, type MaterialOwned, type MaterialPrices } from './honing-cost';
import type { Upgrade } from './upgrades';
import { accessoryPriceKey } from './accessory-sets';

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
	/** Bound honing mats per character key. */
	bound: Record<string, MaterialOwned>;
	pricesAt: number | null;
	/** Gold per relic engraving book, by engraving id; shared by every character. */
	bookPrices: Record<string, number>;
	mode: RankMode;
	loaded: boolean;
}>({
	costs: {},
	prices: {},
	bound: {},
	pricesAt: null,
	bookPrices: {},
	mode: 'cp',
	loaded: false
});

export function loadGold() {
	if (gold.loaded || typeof localStorage === 'undefined') return;
	gold.costs = read();
	try {
		const p = JSON.parse(localStorage.getItem(PRICES_KEY) ?? 'null');
		if (p && typeof p.prices === 'object') ((gold.prices = p.prices), (gold.bound = p.bound ?? {}), (gold.pricesAt = p.at ?? null));
	} catch {
		/* none yet */
	}
	try {
		const b = JSON.parse(localStorage.getItem(BOOKS_KEY) ?? '{}');
		if (b && typeof b === 'object') gold.bookPrices = b;
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

export function setGoldCost(key: string, cost: number | null) {
	key = accessoryPriceKey(key, {});
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

function saveMaterials() {
	gold.pricesAt = Date.now();
	try {
		localStorage.setItem(PRICES_KEY, JSON.stringify({ prices: gold.prices, bound: gold.bound, at: gold.pricesAt }));
	} catch {
		/* storage blocked: lasts for this visit */
	}
}

/** Gold per unit for a honing material (null clears it). */
export function setMaterialPrice(id: string, price: number | null) {
	if (price === null) delete gold.prices[id];
	else gold.prices[id] = price;
	saveMaterials();
}

/** A character's bound units of a honing material, used before buying; PLENTY for "plenty". */
export function setMaterialBound(characterKey: string, id: string, amount: number | null) {
	const mine = (gold.bound[characterKey] ??= {});
	if (!amount) delete mine[id];
	else mine[id] = amount;
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
export function setBookPrice(engraving: number, price: number | null) {
	if (price === null) delete gold.bookPrices[engraving];
	else gold.bookPrices[engraving] = price;
	try {
		localStorage.setItem(BOOKS_KEY, JSON.stringify(gold.bookPrices));
	} catch {
		/* storage blocked: lasts for this visit */
	}
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
	const plain = text.trim().toLowerCase().replaceAll(',', '').replace(/\s*(gold|g)$/, '');
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

/** Equipment honing is priced from materials; old manually entered totals no longer override it. */
export const manualGoldCost = (u: Upgrade, costs: Record<string, number>) => u.category === 'honing' || u.category === 'quality' ? undefined : costs[accessoryPriceKey(u.key, costs)];

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
