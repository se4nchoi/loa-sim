import type { ReplayHit, ReplayRun } from '$lib/logs/protocol';
import type { StatDeltas } from './dps-stats';
import { critEvolutionBonus, validCritConversion, type CritConversion } from './crit-conversion';

/** Explicit assumed stat totals on a hit. Fractions except main/weapon/flat attack.
 * A context can be supplied per hit when actual inspected/buff totals become available. */
export interface HitContext {
	mainStat: number;
	weaponPower: number;
	attackPowerPct: number;
	baseAttackPct: number;
	flatAttack: number;
	baseAttackFlat?: number;
	supportAttack: number;
	additionalDamage: number;
	critRate: number;
	critMultiplier: number;
	/** Primary additive crit-damage bucket, when known. Other crit multipliers stay inside critMultiplier. */
	primaryCritDamageRate?: number;
	critCap: number;
	/** Evolution bucket without the bonus supplied by critConversion, to avoid double counting. */
	evolutionDamage?: number;
	critConversion?: CritConversion;
}

const cap = (rate: number, limit: number) => Math.max(0, Math.min(limit, rate));
const attack = (c: HitContext) => ((Math.sqrt(c.mainStat * c.weaponPower / 6) + (c.baseAttackFlat ?? 0)) * (1 + c.baseAttackPct) + c.flatAttack + c.supportAttack) * (1 + c.attackPowerPct);

/** Same-hit stat replay. Buff/defense/directional factors unchanged by these deltas cancel in the ratio.
 * Crit rate is expected value at the explicitly provided rate/cap, never a re-roll of observed hits. */
export function replayHitRatio(hit: ReplayHit, context: HitContext, delta: StatDeltas): number | null {
	if (hit.hyper) return 1;
	const fields = Object.values(context).filter(v => typeof v !== 'object');
	if (fields.some(v => !Number.isFinite(v)) || Object.values(delta).some(v => !Number.isFinite(v)) || context.mainStat <= 0 || context.weaponPower <= 0 || context.baseAttackPct <= -1 || context.flatAttack < 0 || context.supportAttack < 0 ||
		(context.baseAttackFlat ?? 0) < 0 || context.critMultiplier < 1 || context.critCap < 0 || context.critCap > 1 || context.additionalDamage <= -1 || context.attackPowerPct <= -1 ||
		(context.evolutionDamage ?? 0) <= -1 || (context.primaryCritDamageRate ?? 0) <= -1 || context.critConversion && !validCritConversion(context.critConversion)) return null;
	const next: HitContext = { ...context, mainStat: context.mainStat + delta.mainStat, weaponPower: context.weaponPower + delta.weaponPower,
		flatAttack: context.flatAttack + delta.attackPower, attackPowerPct: context.attackPowerPct + delta.attackPowerPct / 100,
		baseAttackFlat: (context.baseAttackFlat ?? 0) + (delta.baseAttackFlat ?? 0),
		baseAttackPct: context.baseAttackPct + (delta.baseAttackPct ?? 0) / 100,
		additionalDamage: context.additionalDamage + delta.additionalDamage / 100,
		critRate: context.critRate + delta.critRate / 100,
		critMultiplier: context.primaryCritDamageRate === undefined ? context.critMultiplier + delta.critDamage / 100
			: context.critMultiplier * (1+context.primaryCritDamageRate+delta.critDamage/100)/(1+context.primaryCritDamageRate),
		...(context.primaryCritDamageRate !== undefined ? {primaryCritDamageRate:context.primaryCritDamageRate+delta.critDamage/100} : {}),
		evolutionDamage: (context.evolutionDamage ?? 0) + (delta.evolutionDamage ?? 0) / 100 };
	if (next.mainStat <= 0 || next.weaponPower <= 0 || (next.baseAttackFlat ?? 0) < 0 || next.flatAttack < 0 || next.baseAttackPct <= -1 || next.critMultiplier < 1 || next.attackPowerPct <= -1 || next.additionalDamage <= -1 || attack(context) <= 0 || attack(next) <= 0) return null;
	const critCap = context.critConversion?.threshold ?? context.critCap;
	const beforeCrit = 1 + cap(context.critRate, critCap) * (context.critMultiplier - 1);
	const afterCrit = 1 + cap(next.critRate, critCap) * (next.critMultiplier - 1);
	const crit = delta.critRate !== 0 ? afterCrit / beforeCrit : hit.crit ? next.critMultiplier / context.critMultiplier : 1;
	const evolution = (c: HitContext) => 1 + (c.evolutionDamage ?? 0) + (c.critConversion ? critEvolutionBonus(c.critRate,c.critConversion) : 0);
	if (evolution(next) <= 0) return null;
	const result = attack(next) / attack(context) * (1 + next.additionalDamage) / (1 + context.additionalDamage) * evolution(next) / evolution(context) * crit;
	return Number.isFinite(result) && result >= 0 ? result : null;
}

export interface ReplayResult { gainPct: number | null; runs: number; coveragePct: number; minPct: number | null; maxPct: number | null; invalidHits: number }

/** Average gains per run; preserve untracked damage as fixed rather than scaling it without evidence. */
export function replayStats(runs: ReplayRun[], delta: StatDeltas, contextOf: (run: ReplayRun, hit: ReplayHit) => HitContext | null): ReplayResult {
	const gains: number[] = [];
	let coverage = 0, invalidHits = 0;
	for (const run of runs) {
		if (!run.hits.length || run.totalDamage <= 0) continue;
		let extra = 0, tracked = 0, invalid = false;
		for (const hit of run.hits) {
			const context = contextOf(run,hit);
			const ratio = hit.hyper ? 1 : context ? replayHitRatio(hit,context,delta) : null;
			if (ratio === null || !Number.isFinite(ratio)) { invalidHits++; invalid = true; continue; }
			extra += hit.damage * (ratio - 1);
			tracked += hit.damage;
		}
		if (invalid || tracked > run.totalDamage * 1.001) continue;
		gains.push(extra / run.totalDamage * 100);
		coverage += tracked / run.totalDamage * 100;
	}
	return {gainPct:gains.length ? gains.reduce((a,b)=>a+b,0) / gains.length : null, runs:gains.length,
		coveragePct:gains.length ? coverage/gains.length : 0, minPct:gains.length ? Math.min(...gains) : null,
		maxPct:gains.length ? Math.max(...gains) : null, invalidHits};
}
