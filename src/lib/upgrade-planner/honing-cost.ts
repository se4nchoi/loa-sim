// Gold cost of one normal honing step from the player's materials, using the game's honing table
// (honing-cost-data.ts): each failure raises the chance (up to a cap) and fills artisan's energy; a full meter makes
// the next tap certain. Owned (bound) materials are used first and the rest is bought at market price. Breath can be
// added to every tap; whichever of "no breath" and "full breath" is cheaper on average is used.

import { BRACER_LIMITS, type BracerGrade } from './bracer';
import { BRACER_TAPS } from './bracer-cost-data';
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
	/** Whether breath is used, and which (e.g. "Lava's Breath + Glacier's Breath"). */
	breath: boolean;
	breathLabel: string;
}

export const tapsFor = (set: HoningSet, slot: HoningSlot, toLevel: number): HoningTap | undefined =>
	HONING_COSTS[set][slot === 'weapon' ? 'weapon' : 'armor'][toLevel - 1];

/** Chance the step succeeds on tap n + 1, for every n up to the tap the meter forces. */
function successByTap(tap: HoningTap, extra: number): number[] {
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

/**
 * Expected and worst-case gold for one honing step: the one-time growth (shards), gold per tap, and whatever
 * materials must be bought once bound ones run out.
 */
export function honingCost(tap: HoningTap, prices: MaterialPrices, owned: MaterialOwned = {}): HoningCost {
	// [id, per tap, one-time]
	const use: [string, number, number][] = [[SHARDS, tap.shards, tap.growth ?? 0], ...Object.entries(tap.mats).map(([id, n]) => [id, n, 0] as [string, number, number])];
	const bought = (id: string, perTap: number, once: number, taps: number) =>
		(prices[id] ?? 0) * Math.max(0, once + perTap * taps - (owned[id] ?? 0));
	// Every combination of the step's breaths (none, each, all), each used in full.
	const kinds = [tap.breath, tap.moreBreath].filter((b): b is NonNullable<typeof b> => !!b && b.max > 0);
	const combos = kinds.reduce<(typeof kinds)[]>((all, b) => [...all, ...all.map((c) => [...c, b])], [[]]);
	const options = combos.map((breaths) => {
		const mats = [...use, ...breaths.map((b) => [String(b.id), b.max, 0] as [string, number, number])];
		const costOf = (taps: number) => taps * tap.gold + mats.reduce((g, [id, n, once]) => g + bought(id, n, once, taps), 0);
		const dist = successByTap(tap, breaths.reduce((x, b) => x + b.rate * b.max, 0));
		return {
			breath: breaths.length > 0,
			breathLabel: breaths.map((b) => materialName(String(b.id))).join(' + '),
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
type GearSets = Partial<Record<HoningSlot, { set?: 'aegir' }>>;

/** The honing table row behind a Next Upgrades key: gear "honing:<slot>:<to>", or a bracer honing step
 *  "bracer:<grade>:<to>" (not the free first bracer or a limit break, which keep the step but raise the grade). */
function tapForKey(key: string, gear: GearSets): HoningTap | undefined {
	const [kind, a, b] = key.split(':');
	const to = Number(b);
	if (kind === 'honing') return tapsFor(setOf(gear[a as HoningSlot]), a as HoningSlot, to);
	if (kind === 'bracer' && a in BRACER_LIMITS && to > BRACER_LIMITS[a as BracerGrade][0]) return BRACER_TAPS[to - 1];
	return undefined;
}

/** Calculated costs for the honing rows among `keys`. */
export function autoHoningCosts(keys: string[], gear: GearSets, prices: MaterialPrices, owned: MaterialOwned = {}): Record<string, HoningCost> {
	const out: Record<string, HoningCost> = {};
	for (const key of keys) {
		const tap = tapForKey(key, gear);
		const cost = tap && honingCost(tap, prices, owned);
		if (cost) out[key] = cost;
	}
	return out;
}

/** Prices the honing rows among `keys` need: leapstones, stones, fusion, breath, then shards. */
export function materialsFor(keys: string[], gear: GearSets): string[] {
	const ids = new Set<string>();
	for (const key of keys) {
		const tap = tapForKey(key, gear);
		if (!tap) continue;
		for (const id of Object.keys(tap.mats)) ids.add(id);
		for (const b of [tap.breath, tap.moreBreath]) if (b?.max) ids.add(String(b.id));
	}
	const order = (id: string) => (id.startsWith('6611022') ? 0 : id.startsWith('66102') ? 1 : id.startsWith('6861') ? 2 : 3);
	return [...[...ids].sort((a, b) => order(a) - order(b) || a.localeCompare(b)), ...(ids.size ? [SHARDS] : [])];
}
