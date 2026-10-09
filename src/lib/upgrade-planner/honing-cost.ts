// Gold cost of one normal honing step from the player's materials, using the game's honing table
// (honing-cost-data.ts): each failure raises the chance (up to a cap) and fills artisan's energy; a full meter makes
// the next tap certain. Owned (bound) materials are used first and the rest is bought at market price. Breath can be
// added to every tap; whichever of "no breath" and "full breath" is cheaper on average is used.

import { HONING_COSTS, HONING_MATERIALS, type HoningSet, type HoningTap } from './honing-cost-data';
import type { HoningSlot } from './honing-data';

/** Gold per unit, by material item id; `shards` is gold per shard. Missing = 0. */
export type MaterialPrices = Record<string, number>;
/** Units owned (bound or banked), by the same ids; used before buying. Missing = 0. */
export type MaterialOwned = Record<string, number>;
export const SHARDS = 'shards';
/** Stands for "plenty" (typed as ∞ or a very large number). */
export const PLENTY = 1e12;

export interface HoningCost {
	/** Average gold to reach the level. */
	expected: number;
	/** Gold if every tap fails until artisan's energy forces a success. */
	worst: number;
	/** Average and maximum taps. */
	taps: number;
	maxTaps: number;
	breath: boolean;
}

export const tapsFor = (set: HoningSet, slot: HoningSlot, toLevel: number): HoningTap | undefined =>
	HONING_COSTS[set][slot === 'weapon' ? 'weapon' : 'armor'][toLevel - 1];

/** Chance the step succeeds on tap n + 1, for every n up to the tap the meter forces. */
function successByTap(tap: HoningTap, breath: boolean): number[] {
	const extra = breath ? tap.breath.rate * tap.breath.max : 0;
	const out: number[] = [];
	let reach = 1; // chance tap n + 1 happens
	let energy = 0; // 1 = full meter
	for (let n = 0; ; n++) {
		const chance = energy >= 1 ? 1 : Math.min(1, (tap.success + Math.min(n * tap.failBonus, tap.failMax) + extra) / 10000);
		out.push(reach * chance);
		if (chance >= 1) return out;
		energy += (chance * 10000) / tap.energy;
		reach *= 1 - chance;
	}
}

/** Expected and worst-case gold for one honing step: gold per tap, plus whatever materials must be bought. */
export function honingCost(tap: HoningTap, prices: MaterialPrices, owned: MaterialOwned = {}): HoningCost {
	const use: [string, number][] = [[SHARDS, tap.shards], ...Object.entries(tap.mats)];
	const bought = (id: string, perTap: number, taps: number) => (prices[id] ?? 0) * Math.max(0, perTap * taps - (owned[id] ?? 0));
	const options = [false, true].map((breath) => {
		const mats = breath ? [...use, [String(tap.breath.id), tap.breath.max] as [string, number]] : use;
		const costOf = (taps: number) => taps * tap.gold + mats.reduce((g, [id, n]) => g + bought(id, n, taps), 0);
		const dist = successByTap(tap, breath);
		return {
			breath,
			expected: dist.reduce((g, p, n) => g + p * costOf(n + 1), 0),
			worst: costOf(dist.length),
			taps: dist.reduce((t, p, n) => t + p * (n + 1), 0),
			maxTaps: dist.length
		};
	});
	return options.reduce((a, b) => (b.expected < a.expected ? b : a));
}

export const materialName = (id: string) => (id === SHARDS ? 'Destiny Shard' : (HONING_MATERIALS[id]?.[0] ?? id));
/** Shards come in pouches of 500 / 1,000 / 2,000; the 1,000 pouch stands for them. */
export const materialIcon = (id: string) => (id === SHARDS ? 'Use_12_92' : HONING_MATERIALS[id]?.[1]);

/** Gear set of a slot in the simulator state (Serca unless marked Aegir). */
const setOf = (gear: { set?: 'aegir' } | undefined): HoningSet => (gear?.set === 'aegir' ? 'aegir' : 'serca');
const honingStep = (key: string) => {
	const [kind, slot, to] = key.split(':');
	return kind === 'honing' ? { slot: slot as HoningSlot, to: Number(to) } : null;
};
type GearSets = Partial<Record<HoningSlot, { set?: 'aegir' }>>;

/** Calculated costs for the honing rows among `keys`. */
export function autoHoningCosts(keys: string[], gear: GearSets, prices: MaterialPrices, owned: MaterialOwned = {}): Record<string, HoningCost> {
	const out: Record<string, HoningCost> = {};
	for (const key of keys) {
		const step = honingStep(key);
		const tap = step && tapsFor(setOf(gear[step.slot]), step.slot, step.to);
		const cost = tap && honingCost(tap, prices, owned);
		if (cost) out[key] = cost;
	}
	return out;
}

/** Prices the honing rows among `keys` need: leapstones, stones, fusion, breath, then shards. */
export function materialsFor(keys: string[], gear: GearSets): string[] {
	const ids = new Set<string>();
	for (const key of keys) {
		const step = honingStep(key);
		const tap = step && tapsFor(setOf(gear[step.slot]), step.slot, step.to);
		if (!tap) continue;
		for (const id of Object.keys(tap.mats)) ids.add(id);
		ids.add(String(tap.breath.id));
	}
	const order = (id: string) => (id.startsWith('6611022') ? 0 : id.startsWith('66102') ? 1 : id.startsWith('6861') ? 2 : 3);
	return [...[...ids].sort((a, b) => order(a) - order(b) || a.localeCompare(b)), ...(ids.size ? [SHARDS] : [])];
}
