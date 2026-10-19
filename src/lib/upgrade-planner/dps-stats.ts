// DPS gain from the meter's own per-stat values (see $lib/logs/stat-values): a change's raw stat deltas times what
// LOA Logs worked out one more of each stat adds for this player. Covers what those values describe: main stat and
// Weapon Power (honing, bracer, Esther weapon, skins, accessory and bracelet main stat, Weapon Power lines),
// accessory Additional Damage / Atk. Power / Crit lines and weapon quality. Anything else (engravings, gems, Ark Grid,
// karma, bracelet effects, Paradise, Outgoing Damage lines) isn't in them, so those changes have no DPS figure.
// A straight-line estimate: fine for one upgrade, a little off for very large jumps.

import type { StatValues } from '$lib/logs/protocol';
import { bracerStats } from './bracer';
import { qualityStat } from './quality';
import { ACCESSORY_LINES } from './tables';
import { ACCESSORY_SLOTS, braceletStats, braceletEffects, isOtherLine, simulate, type SimState } from './simulate';
import type { Loadout } from './types';

export interface StatDeltas {
	mainStat: number;
	weaponPower: number;
	/** Percentage points. */
	additionalDamage: number;
	critRate: number;
	critDamage: number;
	attackPowerPct: number;
	/** Flat Atk. Power. */
	attackPower: number;
	/** T4 gem base-attack multiplier; separate from accessory Atk. Power %. */
	baseAttackPct?: number;
	/** Evolution-damage percentage points, used by the explicit per-hit model. */
	evolutionDamage?: number;
}

/** Fields whose changes the stat values cover; the rest of SimState either doesn't move stats or isn't covered. */
const COVERED = new Set<keyof SimState>(['bracer', 'sidereal', 'gear', 'quality', 'accessories', 'accessoryStats', 'skins', 'bracelet']);
/** Not about the character's gear: ignore when comparing. */
const IGNORED = new Set<keyof SimState>(['skillShares', 'skillCooldownUse']);
/** Accessory lines and the stat each feeds (values are 1/100 %, flat lines whole numbers). Weapon Power lines come
 * through the simulated Weapon Power instead. */
const LINE_STAT: Record<string, keyof StatDeltas> = {
	add_dmg: 'additionalDamage',
	atk_pct: 'attackPowerPct',
	crit_rate: 'critRate',
	crit_dmg: 'critDamage',
	atk_flat: 'attackPower'
};
const SCALE: Partial<Record<keyof StatDeltas, number>> = { additionalDamage: 100, attackPowerPct: 100, critRate: 100, critDamage: 100 };

function lineTotals(state: SimState): Partial<Record<keyof StatDeltas, number>> {
	const out: Partial<Record<keyof StatDeltas, number>> = {};
	for (const slot of ACCESSORY_SLOTS)
		for (const ln of state.accessories[slot] ?? []) {
			if (isOtherLine(ln)) continue;
			const stat = LINE_STAT[ln.key];
			const line = ACCESSORY_LINES.find((l) => l.key === ln.key);
			if (!stat || !line) continue;
			out[stat] = (out[stat] ?? 0) + line.values[ln.tier] / (SCALE[stat] ?? 1);
		}
	return out;
}

const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

// These T4 families have one variable stat and an identical secondary bonus at every roll.
// Only within-family roll changes are covered; adding/removing/swapping a family needs its secondary effect too.
const BRACELET_ROLLS: Record<number, { stat: keyof StatDeltas; values: number[] }> = {
	1101: { stat: 'critRate', values: [5, 4.2, 3.4, 2.6] },
	1102: { stat: 'critDamage', values: [10, 8.4, 6.8, 5.2] },
	1104: { stat: 'additionalDamage', values: [3.5, 3, 2.5, 2] }
};
function braceletTotals(s: SimState) {
	const stats: Partial<Record<keyof StatDeltas, number>> = {};
	const signature: string[] = [];
	for (const key of braceletEffects(s.bracelet)) {
		const [kind, id] = key.split(':').map(Number);
		const family = Math.floor(id / 10), roll = id % 10 - 1;
		const entry = kind === 3 ? BRACELET_ROLLS[family] : undefined;
		if (!entry || roll < 0 || roll >= entry.values.length) { signature.push(key); continue; }
		signature.push(`family:${family}`);
		stats[entry.stat] = (stats[entry.stat] ?? 0) + entry.values[roll];
	}
	// Main stat and flat Weapon Power are read by simulate(); other combat stats need separate models.
	const unknownStats = braceletStats(s.bracelet).filter(x => ![3, 4, 5, 11, 151].includes(x.index) || (x.type ?? 2) !== 2);
	return { stats, signature: signature.sort(), unknownStats };
}

/** Damage lines the stat values don't describe (Outgoing Damage), as total line value per line name. */
function unvaluedLines(s: SimState): Record<string, number> {
	const out: Record<string, number> = {};
	for (const slot of ACCESSORY_SLOTS)
		for (const ln of s.accessories[slot] ?? []) {
			if (isOtherLine(ln) || LINE_STAT[ln.key] || ln.key.startsWith('weapon_')) continue;
			const line = ACCESSORY_LINES.find((l) => l.key === ln.key);
			if (line) out[line.name] = (out[line.name] ?? 0) + line.values[ln.tier];
		}
	return out;
}

/** The stat change, assuming only covered fields moved and the bracelet's effects match (checked by the callers). */
function rawDeltas(l: Loadout, from: SimState, to: SimState, base: SimState): StatDeltas {
	const ba = braceletTotals(from), bb = braceletTotals(to);
	const a = simulate(l, from, base), b = simulate(l, to, base);
	const la = lineTotals(from), lb = lineTotals(to);
	const line = (k: keyof StatDeltas) => (lb[k] ?? 0) - (la[k] ?? 0) + (bb.stats[k] ?? 0) - (ba.stats[k] ?? 0);
	const weaponQuality = (s: SimState) => (s.quality.weapon === undefined ? 0 : qualityStat('weapon', s.quality.weapon) / 100);
	return {
		mainStat: b.mainStat - a.mainStat,
		weaponPower: b.weaponPower - a.weaponPower,
		additionalDamage: line('additionalDamage') + weaponQuality(to) - weaponQuality(from),
		critRate: line('critRate'),
		critDamage: line('critDamage'),
		attackPowerPct: line('attackPowerPct'),
		attackPower: line('attackPower') + bracerStats(to.bracer).attackFlat - bracerStats(from.bracer).attackFlat,
		...(bracerStats(to.bracer).attackPercent !== bracerStats(from.bracer).attackPercent ? { baseAttackPct: bracerStats(to.bracer).attackPercent - bracerStats(from.bracer).attackPercent } : {})
	};
}

/** Whether every changed field and bracelet effect is one the stat values describe (accessory lines aside). */
function coveredChange(from: SimState, to: SimState) {
	for (const key of Object.keys(to) as (keyof SimState)[]) {
		if (IGNORED.has(key) || !changed(from[key], to[key])) continue;
		if (!COVERED.has(key)) return false;
	}
	const ba = braceletTotals(from), bb = braceletTotals(to);
	return !changed(ba.signature, bb.signature) && !changed(ba.unknownStats, bb.unknownStats);
}

/**
 * Raw stat change from `from` to `to`, or null when something changed that the stat values don't describe (an
 * engraving, a gem, an Outgoing Damage line, …).
 */
export function statDeltas(l: Loadout, from: SimState, to: SimState, base: SimState): StatDeltas | null {
	if (!coveredChange(from, to)) return null;
	// Outgoing Damage and other lines aren't in the stat values.
	const uncoveredLines = (s: SimState) =>
		ACCESSORY_SLOTS.map((slot) => (s.accessories[slot] ?? []).filter((ln) => isOtherLine(ln) || !LINE_STAT[ln.key] && !ln.key.startsWith('weapon_')));
	if (changed(uncoveredLines(from), uncoveredLines(to))) return null;
	return rawDeltas(l, from, to, base);
}

/**
 * Like statDeltas, but an upgrade that also adds or raises a damage line the values don't describe (Outgoing Damage)
 * still gets its covered part, with that line named in `unvalued`: the real gain is at least what the covered part
 * gives. Losing such a line makes the covered part an overestimate, so that stays null. Lines with no damage value
 * ("other" lines) don't matter here.
 */
export function statDeltasAtLeast(l: Loadout, from: SimState, to: SimState, base: SimState): { delta: StatDeltas; unvalued: string[] } | null {
	const exact = statDeltas(l, from, to, base);
	if (exact) return { delta: exact, unvalued: [] };
	if (!coveredChange(from, to)) return null;
	const before = unvaluedLines(from), after = unvaluedLines(to);
	const names = [...new Set([...Object.keys(before), ...Object.keys(after)])];
	if (names.some((n) => (after[n] ?? 0) < (before[n] ?? 0))) return null;
	return { delta: rawDeltas(l, from, to, base), unvalued: names.filter((n) => (after[n] ?? 0) > (before[n] ?? 0)) };
}

/** DPS change in percent: each stat delta times its value (per point, or per 1,000 for flat stats). */
export function dpsGainPct(d: StatDeltas, v: StatValues): number {
	return (
		(d.mainStat / 1000) * v.mainStat +
		(d.weaponPower / 1000) * v.weaponPower +
		(d.attackPower / 1000) * v.attackPower +
		d.additionalDamage * v.additionalDamage +
		d.critRate * v.critRate +
		d.critDamage * v.critDamage +
		d.attackPowerPct * v.attackPowerPct
		+ (d.evolutionDamage ?? 0) * v.evoDamage
	);
}
