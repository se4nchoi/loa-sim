import type { ReplayRun } from '$lib/logs/protocol';
import { gemMembers, baseAttackOf, skillEffect } from './dps-explain';
import { statGain, type DamageContext } from './dps-stat-engine';
import { statDeltasAtLeast } from './dps-stats';
import type { SimState } from './simulate';
import type { Loadout } from './types';

export interface Checkpoint {
	observed: number;
	estimated: number | null;
	target: number;
	remaining: number | null;
	coveragePct: number;
	notes: string[];
}

/** [start, end), in fight-relative ms. Missing damage is never extrapolated into a phase. */
export function checkpointEstimate(run: ReplayRun, start: number, end: number, target: number,
	loadout: Loadout, baseline: SimState, state: SimState, context?: DamageContext): Checkpoint | null {
	if (![start, end, target].every(Number.isFinite) || start < 0 || end <= start || end > run.duration || target <= 0) return null;
	const timed = run.hits.filter((h) => h.timestamp !== undefined && Number.isFinite(h.timestamp) && h.timestamp >= 0 && h.timestamp <= run.duration && h.damage > 0);
	if (!timed.length || !(run.totalDamage > 0)) return null;
	const hits = timed.filter((h) => h.timestamp! >= start && h.timestamp! < end);
	const observed = hits.reduce((sum, h) => sum + h.damage, 0);
	const coveragePct = Math.min(100, timed.reduce((sum, h) => sum + h.damage, 0) / run.totalDamage * 100);
	const notes: string[] = [];
	if (coveragePct < 99.9) notes.push(`Timed hits cover ${coveragePct.toFixed(1)}% of recorded damage; missing damage is not assigned to this window.`);
	const statState = {...state, gems: baseline.gems};
	const change = statDeltasAtLeast(loadout, baseline, statState, baseline);
	let ratio: number | null = 1;
	if (!change || change.unvalued.length) { ratio = null; notes.push('This window contains an upgrade the damage model does not value.'); }
	else {
		const delta = {...change.delta, baseAttackPct: baseAttackOf(loadout, state) - baseAttackOf(loadout, baseline)};
		if (Object.values(delta).some((n) => n !== 0)) {
			const needsConversion = run.critConversion && !context?.critConversion && (delta.critRate || delta.critDamage || delta.evolutionDamage);
			const gain = context && !needsConversion ? statGain(context, delta) : null;
			ratio = gain === null ? null : 1 + gain / 100;
			if (ratio === null) notes.push('Configure combat totals, including any crit conversion, to estimate stat changes in this window.');
		}
	}
	const gems: {members: Set<number>; factor: number}[] = [];
	if (state.gems.length !== baseline.gems.length) ratio = null;
	state.gems.forEach((g, i) => {
		const was = baseline.gems[i];
		if (JSON.stringify(g) === JSON.stringify(was)) return;
		if (!was || g.skill === null || g.skill !== was.skill || g.kind !== was.kind || g.tier !== was.tier || g.kind !== 'damage') {
			ratio = null; notes.push('Cooldown, added, removed, and swapped gems are not estimated for a fixed checkpoint window.'); return;
		}
		gems.push({members: new Set([...gemMembers(g.skill), g.skill]), factor: 1 + skillEffect(loadout, state,
			{index: i, skill: g.skill, name: '', kind: 'damage', from: was.level, to: g.level, label: ''}, {}).effectPct / 100});
	});
	const estimated = ratio === null ? null : hits.reduce((sum, hit) => sum + hit.damage * (hit.hyper ? 1 : ratio! *
		gems.reduce((factor, gem) => factor * (gem.members.has(hit.skill) ? gem.factor : 1), 1)), 0);
	return {observed, estimated, target, remaining: estimated === null ? null : Math.max(0, target - estimated), coveragePct, notes: [...new Set(notes)]};
}
