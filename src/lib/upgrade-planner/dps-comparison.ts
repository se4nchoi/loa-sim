import type { RunSummary } from '$lib/logs/protocol';
import { checkEngravings } from './dps-loadout';
import { combineStatValues, gateSample } from './dps-gates';
import { explainGem, gemChoices, gemMembers, planModel, skillEffect, statExplanations, type GemExplanation, type StatExplanation } from './dps-explain';
import { modelGain, modelMarginals, type ModelInput } from './dps-model';
import type { SimState } from './simulate';
import type { Loadout } from './types';
import type { Upgrade } from './upgrades';

export interface ExcludedClear { run: RunSummary; reason: string }

/** Recorded Order choices only; this does not describe the full Ark Grid. */
export function orderSetup(run: RunSummary): string | null {
	const values = (['sun', 'moon', 'star'] as const).map(shape => run.arkGridOrder?.[shape]);
	return values.every(v => v !== undefined) ? values.join('/') : null;
}

export function comparisonScope(loadout: Loadout, runs: RunSummary[], player: string, order = '') {
	const included: RunSummary[] = [], excluded: ExcludedClear[] = [];
	let unchecked = 0;
	for (const run of runs) {
		const check = checkEngravings(loadout, run);
		const reason = run.player.toLowerCase() !== player.toLowerCase() ? 'Different character'
			: run.cleared !== true ? 'Not a clear'
			: !(Number.isFinite(run.damage) && run.damage > 0 && Number.isFinite(run.duration) && run.duration > 0) ? 'Incomplete damage data'
			: check?.notInRun.length ? 'Different engravings'
			: order && orderSetup(run) !== order ? orderSetup(run) ? 'Different Order cores' : 'Order cores not recorded' : null;
		if (reason) excluded.push({ run, reason });
		else { included.push(run); if (!check) unchecked++; }
	}
	return { included, excluded, unchecked };
}

/** Shares for display; gains themselves are calculated separately for each clear below. */
export function comparisonSample(runs: RunSummary[]) {
	const sample = gateSample(runs);
	const damage = runs.reduce((sum, run) => sum + run.damage, 0);
	const sums = new Map<number, number>();
	for (const run of runs) for (const skill of run.skills) sums.set(skill.id, (sums.get(skill.id) ?? 0) + skill.damage);
	return { ...sample, skillShares: Object.fromEntries([...sums].map(([id, value]) => [id, damage > 0 ? value / damage * 100 : 0])) };
}

export interface ClearGain { run: RunSummary; gainPct: number | null }

/** Identical baseline/target cohorts. A partially covered candidate cannot receive an overall rank. */
export function combinedGain(clears: ClearGain[]): number | null {
	if (!clears.length || clears.some(c => c.gainPct === null || !Number.isFinite(c.gainPct))) return null;
	const damage = clears.reduce((sum, c) => sum + c.run.damage, 0);
	const duration = clears.reduce((sum, c) => sum + c.run.duration, 0);
	if (!(damage > 0 && duration > 0)) return null;
	const after = clears.reduce((sum, c) => sum + c.run.damage * (1 + c.gainPct! / 100), 0);
	return ((after / duration) / (damage / duration) - 1) * 100;
}

export interface DpsCandidate {
	id: string;
	upgrade: Upgrade;
	gainPct: number | null;
	cpPct: number;
	clears: ClearGain[];
	covered: number;
	gem?: GemExplanation;
	stat?: StatExplanation;
	reason?: string;
	/** What the estimate leaves out or approximates (shown with it, never instead of it). */
	notes: string[];
	/** The gain leaves out part of the upgrade (an Outgoing Damage line), so the real gain is at least gainPct. */
	atLeast: boolean;
	/** Cooldown gems only: the gain if the skill's extra casts all happen, from each clear's own cooldown use. An upper
	 *  bound kept out of the ranking; gainPct over the clears that recorded cooldown use. */
	asPlayed?: { clears: ClearGain[]; gainPct: number | null; covered: number };
}

/** Percent of each skill's fight time on cooldown in one clear (from its ready-but-unused time). */
export function runCooldownUse(run: RunSummary): Record<number, number> {
	return Object.fromEntries(run.skills.flatMap(s => s.timeAvailable === undefined || !(run.duration > 0) ? []
		: [[s.id, Math.max(0, Math.min(100, (1 - Math.min(s.timeAvailable, run.duration) / run.duration) * 100))]]));
}

/** Crit Rate per clear (its own meter value, or the damage-weighted value of the selected clears that have one). */
function critRates(runs: RunSummary[]) {
	const own = runs.map(run => {
		const values = combineStatValues([run.statValues]);
		return values?.statSamples?.critRate ? values.critRate : null;
	});
	const withCrit = runs.filter((_, i) => own[i] !== null);
	const critDamage = withCrit.reduce((sum, run) => sum + run.damage, 0);
	const pooled = critDamage > 0 ? runs.reduce((sum, run, i) => sum + (own[i] === null ? 0 : run.damage * own[i]!), 0) / critDamage : null;
	return { perRun: own.map(v => v ?? pooled), pooled, measured: withCrit.length };
}

const noStats = { mainStat: 0, weaponPower: 0, additionalDamage: 0, critRate: 0, critDamage: 0, attackPowerPct: 0, attackPower: 0 };

/** One legal upgrade, with the same CP and cost key as Simulator; each clear is scored on its own. */
export function compareDpsUpgrades(loadout: Loadout, state: SimState, base: SimState, allRuns: RunSummary[], runs: RunSummary[], upgrades: Upgrade[]): DpsCandidate[] {
	if (!runs.length) return [];
	const sample = comparisonSample(runs);
	const model = planModel(loadout, state, base, allRuns, runs).input;
	// Build buckets are shared; only the recorded Crit Rate value varies per clear. A clear recorded without the meter's
	// values (low performance mode) uses the damage-weighted value of the selected clears that have one.
	const crit = critRates(runs);
	const perRun = runs.map((run, i) => ({ run, model: { ...model, critRate: crit.perRun[i] } }));
	const critNote = crit.measured && crit.measured < runs.length
		? `Crit Rate valued from ${crit.measured} of ${runs.length} clears; the others were recorded without the meter's stat values.` : null;
	const baseAttackNote = !model.buckets ? "Base Atk. Power bonus not included: no recent clear has the meter's stat values." : null;
	const choices = gemChoices(loadout, state);
	const totalDamage = runs.reduce((sum, run) => sum + run.damage, 0);
	const breakdownModel = { ...model, critRate: perRun.every(r => r.model.critRate !== null)
		? perRun.reduce((sum, r) => sum + r.run.damage * r.model.critRate!, 0) / totalDamage : null };
	const stats = new Map(statExplanations(loadout, state, base, breakdownModel, upgrades).map(s => [s.key, s]));
	return upgrades.map(upgrade => {
		const stat = stats.get(upgrade.key);
		const index = Number(upgrade.key.split(':')[3]);
		const choice = upgrade.category === 'gem' ? choices.find(c => c.index === index) : undefined;
		const gem = choice ? explainGem(loadout, state, base, choice, sample.skillShares, sample.skillCooldownUse, model) : undefined;
		const reason = gem?.rough ? 'Cooldown changes need cast and rotation data.' : !gem && !stat ? 'DPS not estimated for this upgrade.' : undefined;
		// A gem in one clear: that clear's share of damage from the gem's skills, times how much more they deal, plus the
		// base attack it adds. Without the gear's buckets the base-attack part is unknown; the skill part is still measured.
		const gemGain = (run: RunSummary, runModel: ModelInput, effectPct: number) => {
			const members = new Set([...gemMembers(gem!.choice.skill), gem!.choice.skill]);
			const share = run.skills.filter(s => members.has(s.id)).reduce((sum, s) => sum + s.damage, 0) / run.damage;
			const attack = gem!.baseAttack ? modelGain({ ...noStats, baseAttackPct: gem!.baseAttack }, runModel).gainPct ?? 0 : 0;
			return ((1 + share * effectPct / 100) * (1 + attack / 100) - 1) * 100;
		};
		const clears = perRun.map(({ run, model }): ClearGain => {
			if (reason) return { run, gainPct: null };
			if (stat) return { run, gainPct: modelGain(stat.delta, model).gainPct };
			if (!gem) return { run, gainPct: null };
			return { run, gainPct: gemGain(run, model, gem.effectPct) };
		});
		// Cooldown gems, clear by clear: as many extra casts as that clear's cooldown use allows.
		const asPlayed = gem?.rough && choice ? (() => {
			const played = perRun.map(({ run, model }): ClearGain => {
				const use = runCooldownUse(run);
				if (![choice.skill, ...gemMembers(choice.skill)].some(id => use[id] !== undefined)) return { run, gainPct: null };
				return { run, gainPct: gemGain(run, model, skillEffect(loadout, state, choice, use).effectPct) };
			});
			const known = played.filter(c => c.gainPct !== null);
			return { clears: played, gainPct: combinedGain(known), covered: known.length };
		})() : undefined;
		const notes = reason ? [] : [
			...(stat?.unvalued.length ? [`${stat.unvalued.join(' and ')} isn't valued yet, so the real gain is higher than shown.`] : []),
			...(stat?.delta.critRate && critNote ? [critNote] : []),
			...(gem?.baseAttack && baseAttackNote ? [baseAttackNote] : [])
		];
		return { id: upgrade.key, upgrade, cpPct: upgrade.gainPct, gainPct: combinedGain(clears), clears,
			covered: clears.filter(c => c.gainPct !== null).length, gem, stat, reason, notes, atLeast: !reason && !!stat?.unvalued.length, asPlayed };
	});
}

export type DpsSort = 'gold' | 'dps' | 'cp';
export function rankDpsCandidates(candidates: DpsCandidate[], costs: Record<string, number>, mode: DpsSort) {
	const efficiency = (c: DpsCandidate) => c.gainPct !== null && c.gainPct > 0 && costs[c.id] !== undefined ? costs[c.id] / c.gainPct : Infinity;
	return [...candidates].sort((a, b) => {
		if (mode === 'cp') return b.cpPct - a.cpPct || a.id.localeCompare(b.id);
		// Unknown DPS never outranks an estimate; an unknown price never becomes zero gold.
		if (mode === 'gold') {
			const ap = efficiency(a), bp = efficiency(b);
			if (ap !== bp) return ap - bp;
		}
		return (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity) || b.cpPct - a.cpPct || a.id.localeCompare(b.id);
	});
}

/** Recorded DPS of the selected clears together: total damage over total fight time (durations are ms). */
export function recordedDps(runs: RunSummary[]): number | null {
	const damage = runs.reduce((sum, run) => sum + run.damage, 0);
	const duration = runs.reduce((sum, run) => sum + run.duration, 0);
	return damage > 0 && duration > 0 ? damage / (duration / 1000) : null;
}

/** 312m, 1.02b, 45.3k: damage numbers as players read them off the meter, to 3 significant figures. */
export function formatDamage(n: number) {
	const abs = Math.abs(n);
	const [div, unit] = abs >= 1e9 ? [1e9, 'b'] : abs >= 1e6 ? [1e6, 'm'] : abs >= 1e3 ? [1e3, 'k'] : [1, ''];
	const v = n / div;
	return `${+v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)}${unit}`;
}

/** Slot alternatives (accessory and quality options) count as one upgrade in the list and in ranks. */
export const slotGroup = (c: DpsCandidate) => ['accessory', 'quality'].includes(c.upgrade.category) ? c.upgrade.group ?? c.id : c.id;

/** Each estimated candidate's place by DPS and by CP: 1 + the number of other slots with a better option. */
export function dpsCpRanks(candidates: DpsCandidate[]) {
	const estimated = candidates.filter(c => c.gainPct !== null);
	const rankBy = (value: (c: DpsCandidate) => number) => {
		const best = new Map<string, number>();
		for (const c of estimated) best.set(slotGroup(c), Math.max(best.get(slotGroup(c)) ?? -Infinity, value(c)));
		return (c: DpsCandidate) => 1 + [...best].filter(([group, v]) => group !== slotGroup(c) && v > value(c)).length;
	};
	const dps = rankBy(c => c.gainPct!), cp = rankBy(c => c.cpPct);
	return new Map(estimated.map(c => [c.id, { dps: dps(c), cp: cp(c) }]));
}

/** The per-clear what-ifs of one upgrade: the newest clear's, and the spread over the clears that have one. */
export function clearSpread(clears: ClearGain[]) {
	const known = clears.filter((c): c is ClearGain & { gainPct: number } => c.gainPct !== null && Number.isFinite(c.gainPct));
	if (!known.length) return null;
	const sorted = known.map(c => c.gainPct).sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return {
		latest: known.reduce((a, b) => (b.run.start > a.run.start ? b : a)),
		low: sorted[0], high: sorted[sorted.length - 1],
		median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
		count: known.length
	};
}

/** What one more of each stat is worth for this plan in the selected clears (DPS %), with Crit Rate pooled the same way
 *  as the upgrades value it. null values: not measurable here. */
export function statWorth(loadout: Loadout, state: SimState, base: SimState, allRuns: RunSummary[], runs: RunSummary[]) {
	if (!runs.length) return null;
	const { input, build } = planModel(loadout, state, base, allRuns, runs);
	const crit = critRates(runs);
	const values = modelMarginals({ ...input, critRate: crit.pooled });
	const rows = ([
		['critRate', '+1% Crit Rate'], ['critDamage', '+1% Crit Damage'], ['additionalDamage', '+1% Additional Damage'],
		['attackPowerPct', '+1% Atk. Power'], ['mainStat', '+1,000 main stat'], ['weaponPower', '+1,000 Weapon Power']
	] as const).map(([key, label]) => ({ key, label, gainPct: values[key] ?? null }));
	const cr = values.critRate, cd = values.critDamage;
	return { rows, critClears: crit.measured, buildClears: build.length, critVsDamage: cr !== undefined && cd !== undefined && cd > 0 ? cr / cd : null };
}
