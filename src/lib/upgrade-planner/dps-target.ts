// "Get me to X DPS": a path of upgrades from the simulated state to a target DPS on the DPS meter's picked clear.
// Greedy, re-measured each step: every one-step upgrade is scored on the meter from where the path is now (gains
// interact: crit near its cap, a second gem on the same skill), the best value is taken, and so on. Value is gold per
// 1% DPS when ranking by gold (unpriced upgrades are left out), the biggest gain otherwise. When the best-value step
// would reach the target, the cheapest (or smallest) step that does ends the path instead of overshooting.
import { applyUpgrade } from './apply-upgrade';
import { maxEquipment } from './sim-max';
import { dpsMeter, meterGain, type Meter } from './dps-meter';
import { supportGain, supportMeter } from './support-meter';
import type { DpsSelection } from './dps-selection.svelte';
import type { SimState } from './simulate';
import type { Loadout } from './types';
import type { Upgrade } from './upgrades';

export interface TargetStep {
	upgrade: Upgrade;
	/** DPS gain of this step, percent of the DPS before it. */
	gainPct: number;
	/** Gold for this step (0 = free), null when ranking by gain and the step has no price. */
	gold: number | null;
	/** Meter DPS after the step. */
	dps: number;
}

export interface TargetPlan {
	startDps: number;
	endDps: number;
	steps: TargetStep[];
	reached: boolean;
	/** Total gold of the priced steps. */
	gold: number;
	/** Upgrades left out because they have no gold cost (ranking by gold). */
	unpriced: number;
	/** Stopped at the step limit with upgrades still helping: planning can go on from `end`. */
	capped: boolean;
	/** The state after the last step. */
	end: SimState;
}

export interface TargetOptions {
	loadout: Loadout;
	/** The Simulator's base (the loadout's own state). */
	base: SimState;
	start: SimState;
	selection: DpsSelection;
	targetDps: number;
	upgradesFor: (s: SimState) => Upgrade[];
	/** Gold for an upgrade made from state `s`; null when unknown. */
	goldFor: (u: Upgrade, s: SimState) => number | null;
	byGold: boolean;
	maxSteps?: number;
}

/** What a plan measures: the meter's damage with the edits over the recorded fight time. */
type Measured = { after: number; durationMs: number };
/** DPS as the meter shows it: damage over the recorded fight time. */
const dpsOf = (m: { after: number; durationMs: number }) => m.after / (m.durationMs / 1000);

export function planToTarget(o: TargetOptions): TargetPlan | null {
	const { loadout, base, selection: sel } = o;
	// A support's plan measures the party DPS their buffs add (support-meter.ts); a dealer's, their own.
	const meterOf = (s: SimState): Measured | null => (sel.support ? supportMeter(loadout, sel.baseline, s, sel.runs[0]) : dpsMeter(loadout, sel.baseline, s, sel.buildRuns, sel.runs, sel.arkGrid, sel.context));
	let state = structuredClone(o.start);
	let meter = meterOf(state);
	if (!meter || !sel.runs.length) return null;
	const plan: TargetPlan = { startDps: dpsOf(meter), endDps: dpsOf(meter), steps: [], reached: dpsOf(meter) >= o.targetDps, gold: 0, unpriced: 0, capped: false, end: state };
	const unpriced = new Set<string>();

	let exhausted = false;
	for (let i = 0; i < (o.maxSteps ?? 15) && !plan.reached; i++) {
		const now = dpsOf(meter);
		const options: { u: Upgrade; next: SimState; gain: number; gold: number | null }[] = [];
		for (const u of o.upgradesFor(state)) {
			// Priced first: the meter is the slow part, and unpriced upgrades can't be on a gold path.
			const gold = o.goldFor(u, state);
			if (o.byGold && gold === null) { unpriced.add(u.key); continue; }
			const next = structuredClone(state);
			if (!applyUpgrade(loadout, next, base, u)) continue;
			const g = sel.support ? { gainPct: supportGain(loadout, sel.baseline, state, next, sel.runs[0]) }
				: meterGain(loadout, sel.baseline, state, next, sel.buildRuns, sel.runs, sel.arkGrid, meter as Meter, sel.context);
			if (g.gainPct === null || !(g.gainPct > 0.001)) continue;
			options.push({ u, next, gain: g.gainPct, gold });
		}
		if (!options.length) { exhausted = true; break; }
		const cost = (x: (typeof options)[number]) => (o.byGold ? x.gold! : x.gain);
		const best = options.reduce((a, b) => {
			if (!o.byGold) return b.gain > a.gain ? b : a;
			const va = a.gold! / a.gain, vb = b.gold! / b.gain;
			return vb < va || (vb === va && b.gain > a.gain) ? b : a;
		});
		// Once the best-value step would reach the target, the cheapest (or smallest) step that does ends the path.
		const reaches = (x: (typeof options)[number]) => now * (1 + x.gain / 100) >= o.targetDps;
		const pick = reaches(best) ? options.filter(reaches).reduce((a, b) => (cost(b) < cost(a) ? b : a)) : best;
		state = pick.next;
		meter = meterOf(state);
		if (!meter) break;
		plan.endDps = dpsOf(meter);
		plan.steps.push({ upgrade: pick.u, gainPct: pick.gain, gold: pick.gold, dps: plan.endDps });
		plan.gold += pick.gold ?? 0;
		plan.reached = plan.endDps >= o.targetDps;
	}
	plan.unpriced = unpriced.size;
	plan.end = state;
	plan.capped = !plan.reached && !exhausted;
	return plan;
}

export interface StepGroup {
	/** First and last step of a run of steps on one item ("Vambraces"), or the one step. */
	first: TargetStep;
	last: TargetStep;
	count: number;
	/** Their DPS gain together, percent. */
	gainPct: number;
	/** Their gold together; null when one of them has none. */
	gold: number | null;
}

/** Consecutive steps on the same item as one line: 27 Vambraces honing steps read as one. */
export function groupSteps(steps: TargetStep[]): StepGroup[] {
	const out: StepGroup[] = [];
	for (const step of steps) {
		const prev = out.at(-1);
		const subject = step.upgrade.subject ?? step.upgrade.category;
		if (prev && (prev.last.upgrade.subject ?? prev.last.upgrade.category) === subject && step.upgrade.category === prev.last.upgrade.category) {
			prev.last = step;
			prev.count++;
			prev.gainPct = ((1 + prev.gainPct / 100) * (1 + step.gainPct / 100) - 1) * 100;
			prev.gold = prev.gold === null || step.gold === null ? null : prev.gold + step.gold;
		} else out.push({ first: step, last: step, count: 1, gainPct: step.gainPct, gold: step.gold });
	}
	return out;
}

/** "1.4b", "1400m", "1,400,000k" → DPS; "+5%" → the current DPS × 1.05. */
export function parseTargetDps(text: string, current: number): number | null {
	const t = text.trim().toLowerCase().replace(/,/g, '');
	const pct = t.match(/^\+?([\d.]+)\s*%$/);
	if (pct) return current * (1 + Number(pct[1]) / 100);
	const m = t.match(/^([\d.]+)\s*([kmb]?)$/);
	if (!m || !Number.isFinite(Number(m[1]))) return null;
	const v = Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9, '': 1 } as Record<string, number>)[m[2]];
	return v > 0 ? v : null;
}

/**
 * About the most gear does on this run: equipment and Vambraces maxed, every gem at level 10, measured on the meter in
 * one go. Accessories, the bracelet and Ark Grid can add a little on top; a target well above this is out of reach
 * with gear, so the plan lists the best upgrades instead of chasing it.
 */
export function gearCeiling(loadout: Loadout, start: SimState, selection: DpsSelection): number | null {
	const s = structuredClone(start);
	maxEquipment(s);
	for (const g of s.gems) g.level = 10;
	const m = selection.support ? supportMeter(loadout, selection.baseline, s, selection.runs[0])
		: dpsMeter(loadout, selection.baseline, s, selection.buildRuns, selection.runs, selection.arkGrid, selection.context);
	return m ? dpsOf(m) : null;
}
