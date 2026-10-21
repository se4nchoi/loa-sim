// Relative expected damage for an explicitly configured combat context. No log or measured stat values required.
import { critEvolutionBonus, validCritConversion, type CritConversion } from './crit-conversion';
import type { StatDeltas } from './dps-stats';

/** Percent fields use percentage points (70 = 70%); flat fields use actual stat values. */
export interface DamageContext {
	mainStat: number;
	weaponPower: number;
	baseAttackPct: number;
	attackPowerPct: number;
	flatAttack: number;
	supportAttack: number;
	additionalDamage: number;
	evolutionDamage: number;
	critRate: number;
	/** Total crit damage: 200 means a critical hit does twice normal damage. */
	critDamage: number;
	critCap: number;
	/** Evolution total must exclude this conversion's bonus. */
	critConversion?: CritConversion;
}
export const ZERO_DELTA: StatDeltas = {mainStat: 0, weaponPower: 0, attackPower: 0, attackPowerPct: 0,
	additionalDamage: 0, critRate: 0, critDamage: 0};

export function validDamageContext(c: DamageContext): boolean {
	return !!c && [c.mainStat, c.weaponPower, c.baseAttackPct, c.attackPowerPct, c.flatAttack, c.supportAttack,
		c.additionalDamage, c.evolutionDamage, c.critRate, c.critDamage, c.critCap].every(Number.isFinite) &&
		c.mainStat > 0 && c.weaponPower > 0 && c.baseAttackPct > -100 && c.attackPowerPct > -100 &&
		c.flatAttack >= 0 && c.supportAttack >= 0 && c.additionalDamage > -100 && c.evolutionDamage > -100 &&
		c.critRate >= 0 && c.critDamage >= 100 && c.critCap >= 0 && c.critCap <= 100 &&
		(!c.critConversion || validCritConversion(c.critConversion));
}

/** A normalized damage factor, not an absolute skill-damage/DPS prediction. */
export function damageFactor(c: DamageContext): number | null {
	if (!validDamageContext(c)) return null;
	const attack = (Math.sqrt(c.mainStat * c.weaponPower / 6) * (1 + c.baseAttackPct / 100) + c.flatAttack) * (1 + c.attackPowerPct / 100) + c.supportAttack;
	const cap = c.critConversion ? c.critConversion.threshold * 100 : c.critCap;
	const crit = 1 + Math.min(c.critRate, cap) / 100 * (c.critDamage / 100 - 1);
	const evolution = 1 + c.evolutionDamage / 100 + (c.critConversion ? critEvolutionBonus(c.critRate / 100, c.critConversion) : 0);
	const factor = attack * (1 + c.additionalDamage / 100) * evolution * crit;
	return Number.isFinite(factor) && factor > 0 ? factor : null;
}

export function changedContext(c: DamageContext, d: StatDeltas): DamageContext {
	return {...c, mainStat: c.mainStat + d.mainStat, weaponPower: c.weaponPower + d.weaponPower,
		flatAttack: c.flatAttack + d.attackPower, attackPowerPct: c.attackPowerPct + d.attackPowerPct,
		baseAttackPct: c.baseAttackPct + (d.baseAttackPct ?? 0), additionalDamage: c.additionalDamage + d.additionalDamage,
		evolutionDamage: c.evolutionDamage + (d.evolutionDamage ?? 0), critRate: c.critRate + d.critRate, critDamage: c.critDamage + d.critDamage};
}

export function statGain(c: DamageContext, d: StatDeltas): number | null {
	if (!Object.values(d).every(Number.isFinite)) return null;
	const before = damageFactor(c), after = damageFactor(changedContext(c, d));
	return before === null || after === null ? null : (after / before - 1) * 100;
}

export const STAT_STEPS = [
	['mainStat', 'Main stat', 1000], ['weaponPower', 'Weapon Power', 1000], ['attackPower', 'Flat Atk. Power', 1000],
	['attackPowerPct', 'Atk. Power', 1], ['baseAttackPct', 'Base Atk. Power', 1], ['additionalDamage', 'Additional Damage', 1],
	['evolutionDamage', 'Evolution Damage', 1], ['critRate', 'Crit Rate', 1], ['critDamage', 'Crit Damage', 1]
] as const;
export function perStatGains(context: DamageContext) {
	return STAT_STEPS.map(([key, label, amount]) => ({key, label, amount,
		gainPct: statGain(context, {...ZERO_DELTA, [key]: amount})}));
}
