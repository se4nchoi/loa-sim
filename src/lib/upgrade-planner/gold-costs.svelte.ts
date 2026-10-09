// Gold costs players enter for Next Upgrades rows (NA has no market API). Kept per upgrade key in this browser and
// shared by every character, so "T4 gem Lv. 7 → 8" is priced once. Ranking by gold uses gold per 1% Combat Power.

import { PLENTY, type MaterialOwned, type MaterialPrices } from './honing-cost';
import type { Upgrade } from './upgrades';

const KEY = 'loa-sim:gold-costs';
const PRICES_KEY = 'loa-sim:material-prices';
const MODE_KEY = 'loa-sim:upgrade-rank';

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
	owned: MaterialOwned;
	pricesAt: number | null;
	mode: RankMode;
	loaded: boolean;
}>({
	costs: {},
	prices: {},
	owned: {},
	pricesAt: null,
	mode: 'cp',
	loaded: false
});

export function loadGold() {
	if (gold.loaded || typeof localStorage === 'undefined') return;
	gold.costs = read();
	try {
		const p = JSON.parse(localStorage.getItem(PRICES_KEY) ?? 'null');
		if (p && typeof p.prices === 'object') ((gold.prices = p.prices), (gold.owned = p.owned ?? {}), (gold.pricesAt = p.at ?? null));
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
		localStorage.setItem(PRICES_KEY, JSON.stringify({ prices: gold.prices, owned: gold.owned, at: gold.pricesAt }));
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

/** Bound units of a honing material, used before buying; PLENTY for "plenty". */
export function setMaterialOwned(id: string, amount: number | null) {
	if (!amount) delete gold.owned[id];
	else gold.owned[id] = amount;
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

/** Gold per 1% Combat Power (lower is better); null without a cost or a gain. */
export const goldPerPct = (u: Upgrade, costs: Record<string, number>) => {
	const cost = costs[u.key];
	return cost && u.gainPct > 0 ? cost / u.gainPct : null;
};

/** Priced upgrades, most efficient first. */
export const byGold = (upgrades: Upgrade[], costs: Record<string, number>) =>
	upgrades
		.map((u) => ({ u, per: goldPerPct(u, costs) }))
		.filter((x): x is { u: Upgrade; per: number } => x.per !== null)
		.sort((a, b) => a.per - b.per)
		.map((x) => x.u);
