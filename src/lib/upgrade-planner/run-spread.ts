// The same fight on the same gear, run to run: how far one run's DPS is from the others'. A target from one run can be
// mostly that run's luck (Soulshan's Kazeros G2 on unchanged gear: 822m on 10-15, 887m on 10-08).
import type { RunSummary } from '$lib/logs/protocol';

/** A dealer's DPS in a run, or a support's party DPS added. */
export const runDps = (r: RunSummary) =>
	(r.support ? Object.values(r.support.kinds).reduce((a, b) => a + b, 0) : r.damage) / (r.duration / 1000);

/**
 * Cleared runs of `run`'s fight (boss and difficulty) on its gear: the same gear snapshot, or without one on either
 * side, the same recorded CP and spec.
 */
export function sameGearRuns(run: RunSummary, runs: RunSummary[]): RunSummary[] {
	const sameGear = (r: RunSummary) =>
		run.loadoutHash && r.loadoutHash ? r.loadoutHash === run.loadoutHash
		: run.combatPower !== null && r.combatPower !== null && Math.abs(r.combatPower - run.combatPower) < 0.01 && r.spec === run.spec;
	return runs.filter((r) => r.cleared === true && r.boss === run.boss && r.difficulty === run.difficulty && r.duration > 0 && sameGear(r));
}

/** The DPS range of those runs, when there are two or more. */
export function dpsSpread(run: RunSummary, runs: RunSummary[]): { low: number; high: number; count: number } | null {
	const same = sameGearRuns(run, runs);
	if (same.length < 2) return null;
	const dps = same.map(runDps);
	return { low: Math.min(...dps), high: Math.max(...dps), count: same.length };
}
