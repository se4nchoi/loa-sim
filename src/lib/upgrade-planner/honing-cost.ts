// Gold cost of one normal honing step from the player's material prices, using the game's honing table
// (honing-cost-data.ts): each failure raises the chance (up to a cap) and fills artisan's energy; a full meter makes
// the next tap certain. Breath can be added to every tap; whichever of "no breath" and "full breath" is cheaper on
// average is used.

import { HONING_COSTS, HONING_MATERIALS, type HoningSet, type HoningTap } from './honing-cost-data';
import type { HoningSlot } from './honing-data';

/** Gold per unit, by material item id; `shards` is gold per shard. Missing = not priced yet. */
export type MaterialPrices = Record<string, number>;
export const SHARDS = 'shards';

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

/** Every price a step needs: its materials, shards and (optionally) breath. */
export const pricesNeeded = (tap: HoningTap) => [...Object.keys(tap.mats), SHARDS];

function run(tap: HoningTap, breath: boolean) {
	const extra = breath ? tap.breath.rate * tap.breath.max : 0;
	let reach = 1; // chance this tap happens
	let taps = 0;
	let energy = 0; // 1 = full meter
	for (let n = 0; ; n++) {
		const chance = energy >= 1 ? 1 : Math.min(1, (tap.success + Math.min(n * tap.failBonus, tap.failMax) + extra) / 10000);
		taps += reach;
		if (chance >= 1) return { taps, maxTaps: n + 1 };
		energy += (chance * 10000) / tap.energy;
		reach *= 1 - chance;
	}
}

/** Expected and worst-case gold for one honing step; null while a needed price is missing. */
export function honingCost(tap: HoningTap, prices: MaterialPrices): HoningCost | null {
	if (pricesNeeded(tap).some((id) => prices[id] === undefined)) return null;
	const perTap = tap.gold + tap.shards * prices[SHARDS] + Object.entries(tap.mats).reduce((g, [id, n]) => g + n * prices[id], 0);
	const breathPrice = prices[String(tap.breath.id)];
	const options = [{ breath: false, cost: perTap, ...run(tap, false) }];
	if (breathPrice !== undefined) options.push({ breath: true, cost: perTap + tap.breath.max * breathPrice, ...run(tap, true) });
	const best = options.reduce((a, b) => (b.cost * b.taps < a.cost * a.taps ? b : a));
	return { expected: best.cost * best.taps, worst: best.cost * best.maxTaps, taps: best.taps, maxTaps: best.maxTaps, breath: best.breath };
}

export const materialName = (id: string) => (id === SHARDS ? 'Destiny Shard' : (HONING_MATERIALS[id]?.[0] ?? id));
export const materialIcon = (id: string) => (id === SHARDS ? undefined : HONING_MATERIALS[id]?.[1]);

/** Gear set of a slot in the simulator state (Serca unless marked Aegir). */
const setOf = (gear: { set?: 'aegir' } | undefined): HoningSet => (gear?.set === 'aegir' ? 'aegir' : 'serca');
const honingStep = (key: string) => {
	const [kind, slot, to] = key.split(':');
	return kind === 'honing' ? { slot: slot as HoningSlot, to: Number(to) } : null;
};
type GearSets = Partial<Record<HoningSlot, { set?: 'aegir' }>>;

/** Calculated costs for the honing rows among `keys` (rows whose prices are all set). */
export function autoHoningCosts(keys: string[], gear: GearSets, prices: MaterialPrices): Record<string, HoningCost> {
	const out: Record<string, HoningCost> = {};
	for (const key of keys) {
		const step = honingStep(key);
		const tap = step && tapsFor(setOf(gear[step.slot]), step.slot, step.to);
		const cost = tap && honingCost(tap, prices);
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
