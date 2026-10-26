// Dev-only backtest of the DPS meter against a player's own logs, run from the browser console on the dev server:
//   const { backtest } = await import('/src/lib/dev/dps-backtest.ts'); await backtest(file, 'Soulshan', loadout)
// Every pair of runs on the same boss and difficulty, each on its own gear (the run's lostark.bible snapshot): the meter
// replays the earlier run with the later run's gear, and its per-skill change is compared with what the logs measured
// (damage per hit, which doesn't depend on fight length). Pairs on the same gear show how much runs vary on their own.
// Not imported by the app.
import { LoaLogsReader } from '$lib/logs/loa-logs';
import type { RunSummary } from '$lib/logs/protocol';
import { isSnapshotHash } from '$lib/bible-data';
import { clearSnapshot, orderCoreKey } from '$lib/upgrade-planner/clear-snapshots';
import { clearState } from '$lib/upgrade-planner/clear-state';
import { dpsMeter, statValueRuns } from '$lib/upgrade-planner/dps-meter';
import { orderCoreEffect } from '$lib/upgrade-planner/ark-grid-dps';
import type { SimState } from '$lib/upgrade-planner/simulate';
import type { Loadout } from '$lib/upgrade-planner/types';

export interface BacktestPair {
	boss: string;
	a: number;
	b: number;
	sameGear: boolean;
	/** Damage-weighted per-hit change over the skills both runs used a lot, in percent: predicted and measured. */
	predicted: number;
	measured: number;
	skills: number;
	notCounted: string[];
}

const MIN_HITS = 20;

/** Damage per hit of each non-hyper skill with enough hits. */
const perHit = (run: RunSummary) =>
	new Map(run.skills.filter((s) => !s.hyper && s.hits >= MIN_HITS && s.damage > 0).map((s) => [s.id, { perHit: s.damage / s.hits, damage: s.damage }]));

/**
 * What the meter leaves out on real runs: each run's own setup (its snapshot) replayed with `loadout`'s current gear, as
 * DPS mode does by default. Counts each "not counted" item and note over the runs, for dealers and supports alike.
 */
export async function coverage(file: File, player: string, loadout: Loadout, newest = 200): Promise<{ runs: number; snapshots: number; failed: number; counts: Record<string, number> }> {
	const { supportMeter } = await import('$lib/upgrade-planner/support-meter');
	const { initSimState } = await import('$lib/upgrade-planner/simulate');
	const reader = new LoaLogsReader();
	try {
		// The newest runs only: each gear snapshot is one request to Mathi's API (cached after).
		const theirs = (await reader.open(file)).filter((e) => e.player === player && e.duration > 0);
		const gear = await reader.gear(player, theirs.map((e) => e.id));
		const encounters = theirs.filter((e) => isSnapshotHash(gear[e.id]?.hash ?? '')).toSorted((a, b) => b.start - a.start).slice(0, newest);
		(globalThis as { __progress?: string }).__progress = `reading ${encounters.length} runs`;
		const { runs } = await reader.runs(player, encounters.map((e) => e.id));
		const now = initSimState(loadout);
		const counts: Record<string, number> = {};
		const states = new Map<string, SimState | null>(), cores = new Map<string, string>();
		let failed = 0;
		const progress = (globalThis as { __progress?: string }), hashes = [...new Set(runs.map((r) => r.loadoutHash!))];
		for (const [i, hash] of hashes.entries()) {
			progress.__progress = `snapshot ${i + 1}/${hashes.length}`;
			try {
				const snap = await Promise.race([clearSnapshot(hash), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 20_000))]);
				states.set(hash, clearState(loadout, snap, runs.find((r) => r.loadoutHash === hash)?.skills).state);
				cores.set(hash, orderCoreKey((snap.arkGridCores ?? []).map((c) => c.id)));
			} catch { states.set(hash, null); }
		}
		for (const [i, run] of runs.entries()) {
			progress.__progress = `run ${i + 1}/${runs.length}`;
			if (i % 25 === 0) await new Promise((r) => setTimeout(r));
			const base = states.get(run.loadoutHash!);
			if (!base) { failed++; continue; }
			// As the panel picks them: the run's own stat values, or the nearest run's on the same gear or cores.
			const build = statValueRuns(run, runs, (r) => cores.get(r.loadoutHash!) === cores.get(run.loadoutHash!));
			const m = loadout.battlePoint.isSupport ? supportMeter(loadout, base, now, run) : dpsMeter(loadout, base, now, build, [run], orderCoreEffect);
			if (!m) { counts['(no meter)'] = (counts['(no meter)'] ?? 0) + 1; continue; }
			const notes = 'notes' in m ? (m.notes as string[]) : [];
			for (const k of [...m.notInMeter.map((x) => `not counted: ${x}`), ...notes.map((x) => `note: ${x.replace(/\(.*\)/, '(…)').slice(0, 120)}`)]) counts[k] = (counts[k] ?? 0) + 1;
		}
		return { runs: runs.length, snapshots: states.size, failed, counts };
	} finally {
		reader.close();
	}
}

export async function backtest(file: File, player: string, loadout: Loadout, opts: { maxPairs?: number } = {}): Promise<BacktestPair[]> {
	const reader = new LoaLogsReader();
	try {
		const theirs = (await reader.open(file)).filter((e) => e.player === player && e.duration > 0 && e.cleared === true);
		const gear = await reader.gear(player, theirs.map((e) => e.id));
		const encounters = theirs.filter((e) => isSnapshotHash(gear[e.id]?.hash ?? ''));
		const { runs } = await reader.runs(player, encounters.map((e) => e.id));
		const states = new Map<string, SimState | null>();
		for (const hash of new Set(runs.map((r) => r.loadoutHash!).filter(Boolean))) {
			try { states.set(hash, clearState(loadout, await clearSnapshot(hash)).state); } catch { states.set(hash, null); }
		}
		const byFight = new Map<string, RunSummary[]>();
		for (const r of runs) if (states.get(r.loadoutHash ?? '')) (byFight.get(`${r.boss}|${r.difficulty}`) ?? byFight.set(`${r.boss}|${r.difficulty}`, []).get(`${r.boss}|${r.difficulty}`)!).push(r);
		const out: BacktestPair[] = [];
		for (const [fight, list] of byFight) {
			list.sort((x, y) => x.start - y.start);
			for (let i = 0; i + 1 < list.length; i++) {
				const a = list[i], b = list[i + 1];
				const sa = states.get(a.loadoutHash!)!, sb = states.get(b.loadoutHash!)!;
				const m = dpsMeter(loadout, sa, sb, [a], [a], orderCoreEffect);
				if (!m) continue;
				const ha = perHit(a), hb = perHit(b);
				let w = 0, pred = 0, meas = 0, n = 0;
				for (const [id, x] of ha) {
					const y = hb.get(id), s = m.skills.find((k) => k.id === id);
					if (!y || !s || !(s.before > 0)) continue;
					w += x.damage; pred += x.damage * (s.after / s.before); meas += x.damage * (y.perHit / x.perHit); n++;
				}
				if (!w) continue;
				out.push({ boss: fight, a: a.id, b: b.id, sameGear: a.loadoutHash === b.loadoutHash, predicted: (pred / w - 1) * 100, measured: (meas / w - 1) * 100, skills: n, notCounted: m.notInMeter });
				if (opts.maxPairs && out.length >= opts.maxPairs) return out;
			}
		}
		return out;
	} finally {
		reader.close();
	}
}
