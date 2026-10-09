// Gold costs players enter for Next Upgrades rows (NA has no market API). Kept per upgrade key in this browser and
// shared by every character, so "T4 gem Lv. 7 → 8" is priced once. Ranking by gold uses gold per 1% Combat Power.

import type { Upgrade } from './upgrades';

const KEY = 'loa-sim:gold-costs';
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
export const gold = $state<{ costs: Record<string, number>; mode: RankMode; loaded: boolean }>({ costs: {}, mode: 'cp', loaded: false });

export function loadGold() {
	if (gold.loaded || typeof localStorage === 'undefined') return;
	gold.costs = read();
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
