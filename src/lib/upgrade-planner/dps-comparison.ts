import type { RunSummary } from '$lib/logs/protocol';
import { checkEngravings } from './dps-loadout';
import { combineStatValues, gateSample } from './dps-gates';
import { explainGem, gemChoices, gemMembers, planModel, statExplanations, type GemExplanation, type StatExplanation } from './dps-explain';
import { modelGain } from './dps-model';
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
}

const noStats = { mainStat: 0, weaponPower: 0, additionalDamage: 0, critRate: 0, critDamage: 0, attackPowerPct: 0, attackPower: 0 };

/** One legal upgrade, with the same CP and cost key as Simulator; each clear is scored on its own. */
export function compareDpsUpgrades(loadout: Loadout, state: SimState, base: SimState, allRuns: RunSummary[], runs: RunSummary[], upgrades: Upgrade[]): DpsCandidate[] {
	if (!runs.length) return [];
	const sample = comparisonSample(runs);
	const model = planModel(loadout, state, base, allRuns, runs).input;
	// Build buckets are shared; only the recorded Crit Rate value varies per clear. A clear recorded without the meter's
	// values (low performance mode) uses the damage-weighted value of the selected clears that have one.
	const own = runs.map(run => {
		const values = combineStatValues([run.statValues]);
		return values?.statSamples?.critRate ? values.critRate : null;
	});
	const withCrit = runs.filter((_, i) => own[i] !== null);
	const critDamage = withCrit.reduce((sum, run) => sum + run.damage, 0);
	const pooledCrit = critDamage > 0 ? runs.reduce((sum, run, i) => sum + (own[i] === null ? 0 : run.damage * own[i]!), 0) / critDamage : null;
	const perRun = runs.map((run, i) => ({ run, model: { ...model, critRate: own[i] ?? pooledCrit } }));
	const critNote = withCrit.length && withCrit.length < runs.length
		? `Crit Rate valued from ${withCrit.length} of ${runs.length} clears; the others were recorded without the meter's stat values.` : null;
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
		const clears = perRun.map(({ run, model }): ClearGain => {
			if (reason) return { run, gainPct: null };
			if (stat) return { run, gainPct: modelGain(stat.delta, model).gainPct };
			if (!gem) return { run, gainPct: null };
			const members = new Set([...gemMembers(gem.choice.skill), gem.choice.skill]);
			const share = run.skills.filter(s => members.has(s.id)).reduce((sum, s) => sum + s.damage, 0) / run.damage;
			// Without the gear's buckets the base-attack part is unknown; the skill part is still measured (see notes).
			const attack = gem.baseAttack ? modelGain({ ...noStats, baseAttackPct: gem.baseAttack }, model).gainPct ?? 0 : 0;
			return { run, gainPct: ((1 + share * gem.effectPct / 100) * (1 + attack / 100) - 1) * 100 };
		});
		const notes = reason ? [] : [
			...(stat?.delta.critRate && critNote ? [critNote] : []),
			...(gem?.baseAttack && baseAttackNote ? [baseAttackNote] : [])
		];
		return { id: upgrade.key, upgrade, cpPct: upgrade.gainPct, gainPct: combinedGain(clears), clears,
			covered: clears.filter(c => c.gainPct !== null).length, gem, stat, reason, notes };
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
