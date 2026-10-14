import { describe, expect, it } from 'vitest';
import type { RunSummary, StatValues } from '$lib/logs/protocol';
import { combineStatValues, gateSample, gatesOf, measuredCrit, raidsOf } from './dps-gates';

const values = (critRate: number): StatValues => ({ runs: 1, statSamples: { critRate: 1, critDamage: 1 }, additionalDamage: 0, critRate, critDamage: 0.4, evoDamage: 0, attackPowerPct: 0, weaponPowerPct: 0, mainStat: 0, weaponPower: 0, attackPower: 0 });
const run = (id: number, boss: string, difficulty: string, skills: [number, number, number, number, number?][], stats: StatValues | null = null): RunSummary => ({
	id, start: id * 1000, boss, difficulty, cleared: true, player: 'Shanzkii', duration: 100_000, combatPower: null, itemLevel: null, spec: null, engravings: [],
	damage: skills.reduce((s, k) => s + k[1], 0), statValues: stats, critConversion: false, meterVersion: null,
	skills: skills.map(([sid, damage, hits, crits, timeAvailable]) => ({ id: sid, damage, critDamage: 0, hits, crits, casts: 1, ...(timeAvailable !== undefined ? { timeAvailable } : {}) }))
});

describe('DPS gates', () => {
	const runs = [
		run(1, 'Death Incarnate Kazeros', 'Hard', [[10, 60, 10, 10, 20_000], [20, 40, 10, 5]], values(0.1)),
		run(2, 'Death Incarnate Kazeros', 'Hard', [[10, 20, 10, 10, 40_000], [20, 80, 10, 5]]),
		run(3, 'Abyss Lord Kazeros', 'Hard', [[10, 50, 1, 1]]),
		run(4, 'Death Incarnate Kazeros', 'Normal', [[10, 50, 1, 1]], values(0.5))
	];
	it('groups by boss and difficulty, newest first, with raid gate labels', () => {
		const gates = gatesOf(runs);
		expect(gates.map(g => [g.label, g.difficulty, g.runs.length, g.withStats])).toEqual([
			['Kazeros G2', 'Normal', 1, 1], ['Kazeros G1', 'Hard', 1, 0], ['Kazeros G2', 'Hard', 2, 1]
		]);
		expect(gates[2].runs.map(r => r.id)).toEqual([2, 1]);
	});
	it('averages shares per run and cooldown over recorded time', () => {
		const s = gateSample(runs.slice(0, 2));
		expect(s.skillShares[10]).toBeCloseTo(40);
		expect(s.skillShares[20]).toBeCloseTo(60);
		expect(s.skillCooldownUse[10]).toBeCloseTo(70);
		expect(s.skillCooldownUse[20]).toBeUndefined();
		expect(s.values?.runs).toBe(1);
		expect(s.values?.critRate).toBeCloseTo(0.1);
	});
	it('measures crit weighted by damage', () => {
		expect(measuredCrit(runs[0])).toBeCloseTo(80);
	});
	it('averages each stat over the runs that have it', () => {
		const v = combineStatValues([values(0.1), null, values(0.3)])!;
		expect(v.runs).toBe(2);
		expect(v.critRate).toBeCloseTo(0.2);
		expect(v.statRanges!.critRate).toEqual({ min: 0.1, max: 0.3 });
		expect(v.statSamples!.mainStat).toBe(0);
		expect(combineStatValues([null])).toBeNull();
	});
});

describe('raids', () => {
	it('puts gates of one raid together and keeps Guardian raids and solo apart', () => {
		const r = (id: number, boss: string, difficulty: string) => ({ id, start: id, boss, difficulty, skills: [], statValues: null }) as unknown as RunSummary;
		const groups = raidsOf([r(1, 'Abyss Lord Kazeros', 'Hard'), r(2, 'Death Incarnate Kazeros', 'Hard'), r(3, 'Argeos', 'Normal'), r(4, 'Abyss Lord Kazeros', 'Solo'), r(5, 'Corvus Tul Rak', 'Hard')]);
		expect(groups.map(g => [g.name, g.subtitle, g.difficulty, g.kind, g.runs.map(x => x.id)])).toEqual([
			['Serca', '', 'Hard', 'raid', [5]],
			['Kazeros', 'Final Act', 'Solo', 'other', [4]],
			['Argeos', '', 'Normal', 'other', [3]],
			['Kazeros', 'Final Act', 'Hard', 'raid', [2, 1]]
		]);
		expect(groups[3].gates.map(g => g.label)).toEqual(['Kazeros G1', 'Kazeros G2']);
	});
});
