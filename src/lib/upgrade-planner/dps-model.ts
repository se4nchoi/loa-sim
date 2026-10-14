// Our stat → damage model for the DPS tab: explains each stat upgrade bucket by bucket, and works for runs the meter
// didn't compute stat values for (LOA Logs skips them in low performance mode).
//
// Damage ∝ attack × (1 + additional damage) × (1 + evolution damage) × crit × (everything else, fixed), with
//   attack = (√(main stat × Weapon Power / 6) × (1 + base attack %) + flat attack) × (1 + Atk. Power %),
// of which only the player's own share α grows (support buffs add attack that doesn't).
//
// The bucket totals belong to the gear, not the fight: across a build's runs the meter's values give the same
// additional-damage total (e.g. 48.8% over two weeks of different raids), and near-identical evolution, attack,
// Weapon Power, main stat and crit damage values. So they're read back from the build's recent runs that have the
// meter's values and applied to every gate. +1% of a bucket at total T is worth 100 / (100 + T) %.
// Crit rate is the exception: what +1% is worth swings by fight (crit buffs, the cap), from 0.04% to 0.67% for one
// build, and can't be recovered from hits (a capped player still shows some non-crits). It needs the gate's own values.

import type { RunSummary, StatValues } from '$lib/logs/protocol';
import { combineStatValues } from './dps-gates';
import type { StatDeltas } from './dps-stats';

/** In-fight bucket totals in percent; ownAttack is α, the player's own share of their attack (0–1). */
export interface Buckets {
	additionalDamage: number;
	evoDamage: number;
	attackPowerPct: number;
	ownAttack: number;
	/** Percent DPS per +1% crit damage; nearly constant for a build. */
	critDamage: number;
}

/** Bucket total T (percent) at which +1 point is worth `pctPerPoint` percent. */
const totalFor = (pctPerPoint: number) => (pctPerPoint > 0 ? (1 / pctPerPoint - 1) * 100 : null);

/** Totals that reproduce the meter's values. mainStat / weaponPower are the character's (the Simulator's). */
export function bucketsFrom(values: StatValues, weaponPower: number): Buckets | null {
	const additionalDamage = totalFor(values.additionalDamage), evoDamage = totalFor(values.evoDamage);
	const sqrtGain = Math.sqrt(1 + 1000 / weaponPower) - 1;
	const ownAttack = weaponPower > 0 && values.weaponPower > 0 ? Math.min(1, values.weaponPower / 100 / sqrtGain) : null;
	if (additionalDamage === null || evoDamage === null || ownAttack === null || !(values.attackPowerPct > 0) || !(values.critDamage > 0)) return null;
	// +1% Atk. Power is worth α × 100 / (100 + A) percent.
	return { additionalDamage, evoDamage, attackPowerPct: (ownAttack / values.attackPowerPct - 1) * 100, ownAttack, critDamage: values.critDamage };
}

/** The build's runs with the meter's values: the newest one's, plus any within 1% CP of it (same gear). */
export function buildRuns(runs: RunSummary[]): RunSummary[] {
	const valued = runs.filter(r => r.statValues).sort((a, b) => b.start - a.start);
	const cp = valued[0]?.combatPower;
	if (!valued.length) return [];
	return cp ? valued.filter(r => r.combatPower !== null && Math.abs(r.combatPower / cp - 1) <= 0.01) : valued.slice(0, 1);
}

export interface ModelInput {
	buckets: Buckets | null;
	/** The gate's percent DPS per +1% crit rate; null when none of its runs have the meter's values. */
	critRate: number | null;
	mainStat: number;
	weaponPower: number;
	/** Base attack % already on the character (T4 gems, bracer). */
	baseAttackPct: number;
}

export function modelInput(allRuns: RunSummary[], gateRuns: RunSummary[], mainStat: number, weaponPower: number, baseAttackPct: number) {
	const build = buildRuns(allRuns);
	const values = combineStatValues(build.map(r => r.statValues));
	const gate = combineStatValues(gateRuns.map(r => r.statValues));
	return {
		input: { buckets: values ? bucketsFrom(values, weaponPower) : null, critRate: gate?.statSamples?.critRate ? gate.critRate : null, mainStat, weaponPower, baseAttackPct } satisfies ModelInput,
		build,
		gateValued: gateRuns.filter(r => r.statValues).length
	};
}

export type PartKey = 'attack' | 'additionalDamage' | 'evoDamage' | 'critRate' | 'critDamage';

export interface GainPart {
	key: PartKey;
	/** Percent more damage from this part alone. */
	gainPct: number;
	/** The stat change, in its own units (percentage points, or attack percent for 'attack'). */
	change: number;
}

export interface ModelGain {
	/** null when something changed that the model can't value here. */
	gainPct: number | null;
	parts: GainPart[];
	missing: string[];
}

/** Percent DPS change for a stat change: the changed buckets multiplied together. */
export function modelGain(d: StatDeltas, input: ModelInput): ModelGain {
	const b = input.buckets;
	const parts: GainPart[] = [];
	const missing: string[] = [];
	if (!b && (d.mainStat || d.weaponPower || d.attackPower || d.attackPowerPct || d.baseAttackPct || d.additionalDamage || d.evolutionDamage || d.critDamage))
		missing.push('No recent run with the meter\'s stat values, so your gear\'s damage buckets are unknown.');
	if (b && (d.mainStat || d.weaponPower || d.attackPower || d.attackPowerPct || d.baseAttackPct)) {
		const before = Math.sqrt(input.mainStat * input.weaponPower / 6) * (1 + input.baseAttackPct / 100);
		const after = Math.sqrt((input.mainStat + d.mainStat) * (input.weaponPower + d.weaponPower) / 6) * (1 + (input.baseAttackPct + (d.baseAttackPct ?? 0)) / 100) + d.attackPower;
		const attackPct = (after / before * (1 + (b.attackPowerPct + d.attackPowerPct) / 100) / (1 + b.attackPowerPct / 100) - 1) * 100;
		parts.push({ key: 'attack', change: attackPct, gainPct: b.ownAttack * attackPct });
	}
	if (b && d.additionalDamage) parts.push({ key: 'additionalDamage', change: d.additionalDamage, gainPct: d.additionalDamage / (100 + b.additionalDamage) * 100 });
	if (b && d.evolutionDamage) parts.push({ key: 'evoDamage', change: d.evolutionDamage, gainPct: d.evolutionDamage / (100 + b.evoDamage) * 100 });
	if (b && d.critDamage) parts.push({ key: 'critDamage', change: d.critDamage, gainPct: d.critDamage * b.critDamage });
	if (d.critRate) {
		if (input.critRate === null) missing.push('Crit rate is worth a different amount in every fight, and no run of this gate has the meter\'s values.');
		else parts.push({ key: 'critRate', change: d.critRate, gainPct: d.critRate * input.critRate });
	}
	return { gainPct: missing.length ? null : (parts.reduce((prod, p) => prod * (1 + p.gainPct / 100), 1) - 1) * 100, parts, missing };
}

/** What the model says one more of each meter stat is worth, to compare with the meter's own values. */
export function modelMarginals(input: ModelInput): Partial<Record<'additionalDamage' | 'evoDamage' | 'attackPowerPct' | 'weaponPower' | 'mainStat' | 'critDamage' | 'critRate', number>> {
	const zero: StatDeltas = { mainStat: 0, weaponPower: 0, additionalDamage: 0, critRate: 0, critDamage: 0, attackPowerPct: 0, attackPower: 0 };
	const one = (d: Partial<StatDeltas>) => modelGain({ ...zero, ...d }, input).gainPct ?? undefined;
	return {
		additionalDamage: one({ additionalDamage: 1 }), evoDamage: one({ evolutionDamage: 1 }), attackPowerPct: one({ attackPowerPct: 1 }),
		weaponPower: one({ weaponPower: 1000 }), mainStat: one({ mainStat: 1000 }), critDamage: one({ critDamage: 1 }), critRate: one({ critRate: 1 })
	};
}
