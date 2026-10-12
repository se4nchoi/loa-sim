// DPS gain from the meter's own per-stat values (see $lib/logs/stat-values): a change's raw stat deltas times what
// LOA Logs worked out one more of each stat adds for this player. Covers what those values describe: main stat and
// Weapon Power (honing, bracer, Esther weapon, skins, accessory and bracelet main stat, Weapon Power lines),
// accessory Additional Damage / Atk. Power / Crit lines and weapon quality. Anything else (engravings, gems, Ark Grid,
// karma, bracelet effects, Paradise, Outgoing Damage lines) isn't in them, so those changes have no DPS figure.
// A straight-line estimate: fine for one upgrade, a little off for very large jumps.

import type { StatValues } from '$lib/logs/protocol';
import { qualityStat } from './quality';
import { ACCESSORY_LINES } from './tables';
import { ACCESSORY_SLOTS, isOtherLine, simulate, type SimState } from './simulate';
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
}

/** Fields whose changes the stat values cover; the rest of SimState either doesn't move stats or isn't covered. */
const COVERED = new Set<keyof SimState>(['bracer', 'sidereal', 'gear', 'quality', 'accessories', 'accessoryStats', 'skins']);
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

/**
 * Raw stat change from `from` to `to`, or null when something changed that the stat values don't describe (an
 * engraving, a gem, an Outgoing Damage line, …).
 */
export function statDeltas(l: Loadout, from: SimState, to: SimState, base: SimState): StatDeltas | null {
	for (const key of Object.keys(to) as (keyof SimState)[]) {
		if (IGNORED.has(key) || !changed(from[key], to[key])) continue;
		if (!COVERED.has(key)) return null;
	}
	// Outgoing Damage and other lines aren't in the stat values.
	const uncoveredLines = (s: SimState) =>
		ACCESSORY_SLOTS.map((slot) => (s.accessories[slot] ?? []).filter((ln) => isOtherLine(ln) || !LINE_STAT[ln.key] && !ln.key.startsWith('weapon_')));
	if (changed(uncoveredLines(from), uncoveredLines(to))) return null;
	const a = simulate(l, from, base), b = simulate(l, to, base);
	const la = lineTotals(from), lb = lineTotals(to);
	const line = (k: keyof StatDeltas) => (lb[k] ?? 0) - (la[k] ?? 0);
	const weaponQuality = (s: SimState) => (s.quality.weapon === undefined ? 0 : qualityStat('weapon', s.quality.weapon) / 100);
	return {
		mainStat: b.mainStat - a.mainStat,
		weaponPower: b.weaponPower - a.weaponPower,
		additionalDamage: line('additionalDamage') + weaponQuality(to) - weaponQuality(from),
		critRate: line('critRate'),
		critDamage: line('critDamage'),
		attackPowerPct: line('attackPowerPct'),
		attackPower: line('attackPower')
	};
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
	);
}
