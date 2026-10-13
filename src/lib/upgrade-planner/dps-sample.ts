import type { ReplayRun } from '$lib/logs/protocol';
import { GEM_SKILL_GROUPS } from './game-data';
import type { SimState } from './simulate';
import type { Loadout } from './types';

export function sampleQuality(runs: ReplayRun[], loadout: Loadout, base: SimState, now = Date.now()) {
	const warnings: string[] = [];
	const contexts = [...new Set(runs.map(r => `${r.boss} · ${r.difficulty || 'Unknown difficulty'}`))];
	const dates = runs.map(r => r.start).filter(Number.isFinite);
	const oldest = dates.length ? Math.min(...dates) : null;
	const newest = dates.length ? Math.max(...dates) : null;
	if (runs.length < 5) warnings.push('Small sample: fewer than 5 contributing runs.');
	if (contexts.length > 1) warnings.push('Mixed encounters: choose the same raid, gate and difficulty.');
	if (newest !== null && now - newest > 14 * 86400000) warnings.push('The newest contributing run is more than 2 weeks old.');
	const hashes = new Set(runs.map(r => r.loadoutHash).filter(Boolean));
	if (hashes.size > 1) warnings.push('The meter recorded different build hashes across these runs.');
	if (runs.some(r => r.critConversion)) warnings.push('Blunt Thorn was active: a simple crit cap cannot replay its conversion to evolution damage.');
	let gemMismatches = 0, gemChecks = 0;
	for (const r of runs) for (const gem of base.gems) {
		if (gem.skill === null) continue;
		const ids = GEM_SKILL_GROUPS[gem.skill] ?? [gem.skill];
		const levels = r.skills.filter(s => ids.includes(s.id)).map(s => gem.kind === 'damage' ? s.damageGem : s.cooldownGem).filter((n): n is number => n !== undefined);
		if (!levels.length) continue;
		gemChecks++;
		if (levels.some(n => n !== gem.level)) gemMismatches++;
	}
	if (gemMismatches) warnings.push(`${gemMismatches} logged gem level comparison${gemMismatches === 1 ? '' : 's'} differ from the loaded snapshot.`);
	const cp = loadout.combatPower?.score;
	if (cp && runs.some(r => r.combatPower !== null && r.combatPower > 0 && Math.abs(r.combatPower / cp - 1) > 0.01))
		warnings.push('Logged Combat Power differs from the loaded snapshot by more than 1%; the gear may differ.');
	const trackedRuns = runs.filter(r => r.hits.length && r.totalDamage > 0);
	const coverage = trackedRuns.length ? trackedRuns.reduce((sum,r) => sum + r.hits.reduce((s,h) => s + h.damage,0) / r.totalDamage * 100,0) / trackedRuns.length : null;
	if (coverage !== null && coverage < 95) warnings.push('Per-hit coverage is below 95%; untracked damage stays unchanged in replay.');
	return { oldest, newest, contexts, warnings, gemChecks, gemMismatches, replayRuns: trackedRuns.length, coverage,
		buildStatus: gemMismatches ? 'Gem mismatch detected' : gemChecks ? 'Checked gem levels match; full build unverified' : 'Full build unverified' };
}
