import type { StatValues } from '$lib/logs/protocol';
import { GEM_BASE_ATTACK } from './game-data';
import { gemDpsGainPct } from './dps';
import { dpsGainPct, statDeltas, type StatDeltas } from './dps-stats';
import { gemParts, simulate, type SimState } from './simulate';
import type { Loadout } from './types';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const STAT_FIELDS = ['bracer', 'sidereal', 'gear', 'quality', 'accessories', 'accessoryStats', 'skins', 'bracelet'] as const;
const CONTEXT = new Set(['skillShares', 'skillCooldownUse']);

export interface DpsEstimate {
	/** Only covered components; null when there is no usable estimate. */
	gainPct: number | null;
	statPct: number | null;
	gemPct: number | null;
	excluded: string[];
	statDelta?: StatDeltas;
	/** Calculation limits for future presentation; these are not additional estimated components. */
	limitations?: string[];
}

/** Compare the same run/rotation with stat and skill-gem multipliers applied together.
 * Unsupported changes stay explicit; they never silently become zero DPS gain. */
export function estimateDps(loadout: Loadout, from: SimState, to: SimState, base: SimState, values: StatValues | null): DpsEstimate {
	const statTarget = structuredClone(from);
	const excluded: string[] = [];
	let hasStats = false;
	for (const key of STAT_FIELDS) {
		if (same(from[key], to[key])) continue;
		const candidate = structuredClone(statTarget);
		Object.assign(candidate, { [key]: structuredClone(to[key]) });
		if (statDeltas(loadout, statTarget, candidate, base)) {
			Object.assign(statTarget, { [key]: structuredClone(to[key]) });
			hasStats = true;
		} else excluded.push(key);
	}
	for (const key of Object.keys(to) as (keyof SimState)[])
		if (key !== 'gems' && !CONTEXT.has(key) && !STAT_FIELDS.includes(key as typeof STAT_FIELDS[number]) && !same(from[key], to[key])) excluded.push(key);
	const gemsChanged = !same(from.gems, to.gems);
	const parts = gemParts(loadout);
	let gemPct: number | null = 0;
	let gemAttack = 0;
	if (gemsChanged) {
		// Unknown assignments cannot be valued as zero. Every changed skill needs a measured share.
		const shares = to.skillShares;
		const changedGems = [...new Set([...from.gems.keys(), ...to.gems.keys()])].filter(i => !same(from.gems[i], to.gems[i]));
		const known = changedGems.every(i => [from.gems[i], to.gems[i]].every(g => g && g.skill !== null && shares[g.skill] !== undefined));
		const before = known ? gemDpsGainPct(base.gems, from.gems, parts, shares, to.skillCooldownUse) : null;
		const after = known ? gemDpsGainPct(base.gems, to.gems, parts, shares, to.skillCooldownUse) : null;
		gemPct = before !== null && after !== null ? ((100 + after) / (100 + before) - 1) * 100 : null;
		if (gemPct === null) excluded.push('gem skill effects (missing damage shares)');
		const bonus = (s: SimState) => s.gems.reduce((sum, g, i) => sum + ((g.tier ?? parts[i]?.tier) === 'T4' ? GEM_BASE_ATTACK[g.level - 1] ?? 0 : 0), 0);
		gemAttack = bonus(to) - bonus(from);
		if (gemAttack && !values) excluded.push('gem base attack (missing stat values)');
	}
	if (hasStats && !values) excluded.push('stat changes (missing stat values)');
	const delta = statDeltas(loadout, from, statTarget, base)!;
	if (gemAttack) delta.baseAttackPct = (delta.baseAttackPct ?? 0) + gemAttack;
	// Base-attack gems add a fraction of sqrt(main stat × Weapon Power / 6), not the accessory Atk % bucket.
	// Convert their added flat AP using the meter's flat-AP marginal value. Snapshot totals are an approximation
	// because the log does not retain the hit's in-fight stat totals.
	const current = simulate(loadout,from,base);
	const limitations: string[] = [];
	if (Math.abs(delta.critRate) > 1) limitations.push('Crit-rate change exceeds the measured +1 percentage point; overcap conversion may saturate.');
	if (delta.critRate < 0) limitations.push('A positive crit-rate marginal does not determine losses when removing crit around a cap.');
	if (Math.abs(delta.mainStat) > current.mainStat * 0.05 || Math.abs(delta.weaponPower) > current.weaponPower * 0.05)
		limitations.push('Large stat change: the meter marginal is linear, but attack power scales with the square root.');
	if (delta.baseAttackPct) limitations.push('Base-attack changes use snapshot totals; in-fight main stat and Weapon Power are not saved.');
	const addedAttack = (delta.baseAttackPct ?? 0) / 100 * Math.sqrt(current.mainStat * current.weaponPower / 6);
	const coveredDelta = { ...delta };
	let anyMeasuredStat = false;
	for (const [key, amount] of Object.entries(delta)) {
		if (!amount || key === 'baseAttackPct') continue;
		const sampleKey = key === 'evolutionDamage' ? 'evoDamage' : key;
		if (values?.statSamples && !values.statSamples[sampleKey]) {
			excluded.push(`${key} (missing meter values)`);
			coveredDelta[key as keyof StatDeltas] = 0;
		} else if (values) anyMeasuredStat = true;
	}
	const baseAttackKnown = !delta.baseAttackPct || !values?.statSamples || !!values.statSamples.attackPower;
	if (!baseAttackKnown) excluded.push('base attack (missing flat-attack values)');
	if (delta.baseAttackPct && baseAttackKnown && values) anyMeasuredStat = true;
	const statPct = values ? (hasStats || gemAttack) && !anyMeasuredStat ? null : dpsGainPct(coveredDelta, values) + (baseAttackKnown ? addedAttack / 1000 * values.attackPower : 0) : hasStats || gemAttack ? null : 0;
	const usable = statPct !== null || gemPct !== null;
	const hasCoveredChange = (hasStats && statPct !== null) || (gemsChanged && gemPct !== null) || (!!gemAttack && statPct !== null);
	const noChanges = !hasStats && !gemsChanged && !excluded.length;
	return {
		gainPct: usable && (hasCoveredChange || noChanges) ? ((1 + (statPct ?? 0) / 100) * (1 + (gemPct ?? 0) / 100) - 1) * 100 : null,
		statPct, gemPct, excluded, statDelta: delta, limitations
	};
}

/** Unknown/partial upgrades sort after fully estimated upgrades, never as zero-gain winners. */
export function rankByDps<T extends { key: string; gainPct: number }>(upgrades: T[], estimates: Map<string, DpsEstimate>): T[] {
	const score = (u: T) => {
		const e = estimates.get(u.key);
		return e && !e.excluded.length && e.gainPct !== null ? e.gainPct : -Infinity;
	};
	return upgrades.toSorted((a, b) => score(b) - score(a) || b.gainPct - a.gainPct);
}
