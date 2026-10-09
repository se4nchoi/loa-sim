// Gold cost of one normal honing step from the player's materials, using the game's honing table
// (honing-cost-data.ts): each failure raises the chance (up to a cap) and fills artisan's energy; a full meter makes
// the next tap certain. Owned (bound) materials are used first and the rest is bought at market price. Breath can be
// compared as no breath, full breath, or full breath for an initial run of taps, then none.

import { BRACER_LIMITS, type BracerGrade } from './bracer';
import { BRACER_TAPS } from './bracer-cost-data';
import { HONING_COSTS, HONING_MATERIALS, type HoningSet, type HoningTap } from './honing-cost-data';
import { KARMA_COSTS, type KarmaTree } from './karma-cost-data';
import type { HoningSlot } from './honing-data';

/** Gold per unit, by material item id; `shards` is gold per shard. Missing = 0. */
export type MaterialPrices = Record<string, number>;
/** Units owned (bound or banked), by the same ids; used before buying. Missing = 0. */
export type MaterialOwned = Record<string, number>;
export const SHARDS = 'shards';
/** Stands for "plenty" (typed as ∞ or a very large number). */
export const PLENTY = 1e12;

export interface HoningMaterialBreakdown {
	materials: { id: string; perTap: number; once: number; until?: number; bound: number; bought: number; price: number; gold: number }[];
	tapGold: number;
}

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
	/** Use full breath for these initial taps, then stop (never spend breath on a guaranteed tap). */
	breathTaps?: number;
	breathMode?: 'none' | 'full' | 'cutoff';
	/** Best candidate for each breath combination and strategy family. */
	strategies?: { label: string; materialIds: string[]; selected: boolean }[];
	breakdown?: { average: HoningMaterialBreakdown; pity: HoningMaterialBreakdown };
}

export const tapsFor = (set: HoningSet, slot: HoningSlot, toLevel: number): HoningTap | undefined =>
	HONING_COSTS[set][slot === 'weapon' ? 'weapon' : 'armor'][toLevel - 1];

/** Chance the step succeeds on tap n + 1, for every n up to the tap the meter forces. */
function successByTap(tap: HoningTap, extra: number, until = 0): { dist: number[]; breathTaps: number } {
	const out: number[] = [];
	let breathTaps = 0;
	let reach = 1; // chance tap n + 1 happens
	let energy = 0; // 1 = full meter
	for (let n = 0; ; n++) {
		const base = energy >= 1 ? 10000 : tap.success + Math.min(n * tap.failBonus, tap.failMax);
		const addBreath = n < until && base < 10000;
		if (addBreath) breathTaps++;
		const chance = Math.min(1, (base + (addBreath ? extra : 0)) / 10000);
		out.push(reach * chance);
		if (chance >= 1) return { dist: out, breathTaps };
		// Fixed-fill meters use integer units so repeated fractions cannot delay pity by a tap.
		energy = tap.meterPerFail !== undefined ? ((n + 1) * tap.meterPerFail) / 10000 : energy + (chance * 10000) / tap.energy;
		reach *= 1 - chance;
	}
}

/**
 * Expected and worst-case gold for one honing step: the one-time growth (shards), gold per tap, and whatever
 * materials must be bought once bound ones run out.
 */
export function honingCost(tap: HoningTap, prices: MaterialPrices, owned: MaterialOwned = {}): HoningCost {
	// [id, per tap, one-time, optional last tap using this material]
	type Requirement = [string, number, number, number?];
	const use: Requirement[] = [[SHARDS, tap.shards, tap.growth ?? 0], ...Object.entries(tap.mats).map(([id, n]) => [id, n, 0] as Requirement)];
	const totalAt = ([, n, once, until = Infinity]: Requirement, taps: number) => once + n * Math.min(taps, until);
	// Every combination of breaths, and every initial full-breath cutoff. This includes stopping at
	// the failure-bonus cap, but also lets prices and bound inventory favor an earlier/later cutoff.
	// This is a prefix-strategy comparison, not a global search of arbitrary per-tap quantities.
	const kinds = [tap.breath, tap.moreBreath].filter((b): b is NonNullable<typeof b> => !!b && b.max > 0);
	const combos = kinds.reduce<(typeof kinds)[]>((all, b) => [...all, ...all.map((c) => [...c, b])], [[]]);
	const options = combos.flatMap((breaths) => {
		const extra = breaths.reduce((x, b) => x + b.rate * b.max, 0);
		const maxUntil = breaths.length ? successByTap(tap, extra, Infinity).breathTaps : 0;
		const cutoffs = breaths.length ? Array.from({ length: maxUntil }, (_, n) => n + 1) : [0];
		return cutoffs.map((until) => {
			const breathMode: 'none' | 'full' | 'cutoff' = !breaths.length ? 'none' : until === maxUntil ? 'full' : 'cutoff';
			const { dist, breathTaps } = successByTap(tap, extra, until);
			const mats: Requirement[] = [...use, ...breaths.map((b) => [String(b.id), b.max, 0, breathTaps] as Requirement)];
			const costOf = (taps: number) => taps * tap.gold + mats.reduce((g, mat) => g + (prices[mat[0]] ?? 0) * Math.max(0, totalAt(mat, taps) - (owned[mat[0]] ?? 0)), 0);
			return {
				mats, dist, materialIds: breaths.map((b) => String(b.id)),
				cost: {
					breath: breaths.length > 0,
					breathLabel: breaths.map((b) => materialName(String(b.id))).join(' + '),
					breathTaps,
					breathMode,
					expected: dist.reduce((g, p, n) => g + p * costOf(n + 1), 0),
					worst: costOf(dist.length),
					taps: dist.reduce((t, p, n) => t + p * (n + 1), 0),
					maxTaps: dist.length
				}
			};
		});
	});
	const best = options.reduce((a, b) => (b.cost.expected < a.cost.expected ? b : a));
	const strategies = new Map<string, typeof best>();
	for (const option of options) {
		const key = `${option.cost.breathMode}:${option.materialIds.join(',')}`;
		const previous = strategies.get(key);
		if (!previous || option.cost.expected < previous.cost.expected) strategies.set(key, option);
	}
	const breakdown = (average: boolean): HoningMaterialBreakdown => ({
		tapGold: tap.gold * (average ? best.cost.taps : best.cost.maxTaps),
		materials: best.mats.filter(([, n, once]) => n > 0 || once > 0).map((mat) => {
			const [id, n, once, until] = mat;
			const at = (taps: number) => {
				const total = totalAt(mat, taps);
				return { bound: Math.min(total, owned[id] ?? 0), bought: Math.max(0, total - (owned[id] ?? 0)) };
			};
			const quantity = average
				? best.dist.reduce((sum, p, i) => {
					const q = at(i + 1);
					return { bound: sum.bound + p * q.bound, bought: sum.bought + p * q.bought };
				}, { bound: 0, bought: 0 })
				: at(best.cost.maxTaps);
			const price = prices[id] ?? 0;
			return { id, perTap: n, once, until, ...quantity, price, gold: quantity.bought * price };
		})
	});
	return {
		...best.cost,
		strategies: [...strategies.values()]
			.sort((a, b) => ['none', 'full', 'cutoff'].indexOf(a.cost.breathMode) - ['none', 'full', 'cutoff'].indexOf(b.cost.breathMode))
			.map((option) => ({ label: breathStrategy(option.cost), materialIds: option.materialIds, selected: option === best })),
		...(best.mats.some(([, n, once]) => n > 0 || once > 0) ? { breakdown: { average: breakdown(true), pity: breakdown(false) } } : {})
	};
}

export const breathStrategy = (cost: HoningCost): string => cost.breath
	? cost.breathMode === 'full' ? `Full ${cost.breathLabel}.` : `Full ${cost.breathLabel} for the first ${cost.breathTaps} tap${cost.breathTaps === 1 ? '' : 's'}, then no breath.`
	: 'No breath.';

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

/** A karma try leaving `level`, priced in gold only (Destiny Stones counted as plentiful). */
const karmaTap = (tree: KarmaTree, level: number): HoningTap | undefined => {
	const k = KARMA_COSTS[tree][level];
	return k && { growth: 0, success: k.success, failBonus: 0, failMax: 0, energy: 1, meterPerFail: k.meter, breath: { id: 0, rate: 0, max: 0 }, gold: k.gold, silver: 0, shards: 0, mats: {} };
};
/** Levels where a karma rank starts (rank 1 at level 1, then every 4 levels). */
const KARMA_RANK_START = [0, 1, 5, 9, 13, 17, 21];
export type KarmaLevels = Partial<Record<KarmaTree, number | null>>;

/** Karma rows: one level ("karma:<tree>:<to>", "karma:evolution-level:<to>") or a whole rank ("karma:evolution:<rank>"). */
function karmaCost(key: string, karma: KarmaLevels): HoningCost | undefined {
	const [kind, what, b] = key.split(':');
	if (kind !== 'karma' || !['evolution', 'evolution-level', 'enlightenment', 'leap'].includes(what)) return undefined;
	const to = Number(b);
	const tree: KarmaTree = what === 'leap' || what === 'enlightenment' ? what : 'evolution';
	const from = what === 'evolution' ? karma.evolution : to - 1;
	const until = what === 'evolution' ? KARMA_RANK_START[to] : to;
	if (from === null || from === undefined || !Number.isInteger(from) || from < 0 || !Number.isInteger(until) || until > 30 || until <= from) return undefined;
	let sum: HoningCost | undefined;
	for (let level = from; level < until; level++) {
		const tap = karmaTap(tree, level);
		if (!tap) return undefined;
		const c = honingCost(tap, {});
		sum = sum
			? { ...sum, expected: sum.expected + c.expected, worst: sum.worst + c.worst, taps: sum.taps + c.taps, maxTaps: sum.maxTaps + c.maxTaps }
			: c;
	}
	return sum;
}

/** Calculated costs for the honing (and karma) rows among `keys`. */
export function autoHoningCosts(
	keys: string[],
	gear: GearSets,
	prices: MaterialPrices,
	owned: MaterialOwned = {},
	karma: KarmaLevels = {}
): Record<string, HoningCost> {
	const out: Record<string, HoningCost> = {};
	for (const key of keys) {
		const k = karmaCost(key, karma);
		if (k) {
			out[key] = k;
			continue;
		}
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

/** Inventory follows equipped gear, independently of which upgrades remain available. */
export function inventoryMaterials(gear: GearSets, hasBracer = false): string[] {
	const keys = Object.entries(gear).filter(([, item]) => item).map(([slot]) => `honing:${slot}:1`);
	if (hasBracer) keys.push('bracer:epic:1');
	return materialsFor(keys, gear);
}
