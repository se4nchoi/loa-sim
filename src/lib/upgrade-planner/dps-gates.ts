// Groups imported runs by raid gate and difficulty, and derives one gate's sample: skill damage shares, cooldown
// use, measured crit rate and the meter's stat values.

import type { RunSummary, StatValues } from '$lib/logs/protocol';
import { raidGateOf } from '$lib/logs/raids';

export interface Gate {
	key: string;
	/** "Kazeros G2", or the boss name for fights outside the raid list. */
	label: string;
	boss: string;
	difficulty: string;
	runs: RunSummary[];
	/** Runs with the meter's stat values (not recorded in low performance mode). */
	withStats: number;
	last: number;
}

const gateKey = (r: RunSummary) => `${r.boss}|${r.difficulty}`;

/** Newest first. */
export function gatesOf(runs: RunSummary[]): Gate[] {
	const by = new Map<string, Gate>();
	for (const r of runs) {
		const key = gateKey(r);
		const gate = by.get(key) ?? { key, label: raidGateOf(r.boss)?.label.replace(/ \(.*\)$/, '') ?? r.boss, boss: r.boss, difficulty: r.difficulty, runs: [], withStats: 0, last: 0 };
		gate.runs.push(r);
		if (r.statValues) gate.withStats++;
		gate.last = Math.max(gate.last, r.start);
		by.set(key, gate);
	}
	for (const g of by.values()) g.runs.sort((a, b) => b.start - a.start);
	return [...by.values()].sort((a, b) => b.last - a.last);
}

const STAT_KEYS = ['additionalDamage', 'critRate', 'critDamage', 'evoDamage', 'attackPowerPct', 'weaponPowerPct', 'mainStat', 'weaponPower', 'attackPower'] as const;

/** Each stat averaged over the runs that recorded it. */
export function combineStatValues(list: (StatValues | null)[]): StatValues | null {
	const valid = list.filter((v): v is StatValues => !!v);
	if (!valid.length) return null;
	const out = { runs: valid.length, statSamples: {} as Record<string, number>, statRanges: {} as Record<string, { min: number; max: number }> } as StatValues;
	for (const key of STAT_KEYS) {
		const values = valid.filter(v => !v.statSamples || v.statSamples[key]).map(v => v[key]);
		out[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
		out.statSamples![key] = values.length;
		if (values.length) out.statRanges![key] = { min: Math.min(...values), max: Math.max(...values) };
	}
	return out;
}

/** Crit rate the player actually had in a run, weighting each skill's crits/hits by its damage. Percent. */
export function measuredCrit(run: RunSummary): number | null {
	const counted = run.skills.filter(s => s.hits > 0);
	const damage = counted.reduce((sum, s) => sum + s.damage, 0);
	return damage > 0 ? counted.reduce((sum, s) => sum + s.damage / damage * (s.crits / s.hits), 0) * 100 : null;
}

export interface GateSample {
	runs: RunSummary[];
	/** Percent of the player's damage per skill, averaged per run so every run counts the same. */
	skillShares: Record<number, number>;
	/** Percent of fight time on cooldown, over runs that recorded it. */
	skillCooldownUse: Record<number, number>;
	values: StatValues | null;
	critRate: number | null;
}

export function gateSample(runs: RunSummary[]): GateSample {
	const sums = new Map<number, number>();
	const cooldown = new Map<number, { available: number; fight: number }>();
	for (const r of runs) for (const s of r.skills) {
		sums.set(s.id, (sums.get(s.id) ?? 0) + s.damage / r.damage);
		if (s.timeAvailable !== undefined && r.duration > 0) {
			const c = cooldown.get(s.id) ?? { available: 0, fight: 0 };
			c.available += Math.min(s.timeAvailable, r.duration);
			c.fight += r.duration;
			cooldown.set(s.id, c);
		}
	}
	const crits = runs.map(measuredCrit).filter((c): c is number => c !== null);
	return {
		runs,
		skillShares: Object.fromEntries([...sums].map(([id, sum]) => [id, sum / runs.length * 100])),
		skillCooldownUse: Object.fromEntries([...cooldown].map(([id, c]) => [id, Math.max(0, Math.min(100, (1 - c.available / c.fight) * 100))])),
		values: combineStatValues(runs.map(r => r.statValues)),
		critRate: crits.length ? crits.reduce((a, b) => a + b, 0) / crits.length : null
	};
}

export interface RaidGroup {
	key: string;
	/** "Kazeros", or the boss for Guardian raids and other fights. */
	name: string;
	/** "Final Act", from the raid label's parentheses; '' when none. */
	subtitle: string;
	difficulty: string;
	/** Raids are the main cards; Guardian raids, solo and other fights sit apart. */
	kind: 'raid' | 'other';
	gates: Gate[];
	runs: RunSummary[];
	withStats: number;
	last: number;
}

/** Runs grouped by raid and difficulty, gates together, newest first. Solo difficulty counts as "other". */
export function raidsOf(runs: RunSummary[]): RaidGroup[] {
	const by = new Map<string, RaidGroup>();
	for (const g of gatesOf(runs)) {
		const raid = raidGateOf(g.boss);
		const kind = raid && !/solo/i.test(g.difficulty) ? 'raid' : 'other';
		const label = raid?.raid ?? g.boss;
		const key = `${label}|${g.difficulty}`;
		const m = label.match(/^(.*?) \((.*)\)$/);
		const group = by.get(key) ?? { key, name: m ? m[1] : label, subtitle: m ? m[2] : '', difficulty: g.difficulty, kind, gates: [], runs: [], withStats: 0, last: 0 };
		group.gates.push(g);
		group.runs.push(...g.runs);
		group.withStats += g.withStats;
		group.last = Math.max(group.last, g.last);
		by.set(key, group);
	}
	for (const r of by.values()) {
		r.runs.sort((a, b) => b.start - a.start);
		r.gates.sort((a, b) => (raidGateOf(a.boss)?.gate ?? 0) - (raidGateOf(b.boss)?.gate ?? 0));
	}
	return [...by.values()].sort((a, b) => b.last - a.last);
}
