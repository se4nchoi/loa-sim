import { describe, expect, it } from 'vitest';
import type { RunSummary, StatValues } from '$lib/logs/protocol';
import { bucketsFrom, buildRuns, modelGain, modelInput, modelMarginals, type ModelInput } from './dps-model';
import type { StatDeltas } from './dps-stats';

// Shanzkii's Serca G2 run on 10-12-26 (meter 1.51.2).
const meter: StatValues = { runs: 1, additionalDamage: 0.7326, evoDamage: 0.5559, attackPowerPct: 0.849, weaponPowerPct: 0.33, critRate: 0.037, critDamage: 0.375, mainStat: 0.062, weaponPower: 0.192, attackPower: 0.43 };
const zero: StatDeltas = { mainStat: 0, weaponPower: 0, additionalDamage: 0, critRate: 0, critDamage: 0, attackPowerPct: 0, attackPower: 0 };
const WP = 260_000, MS = 700_000;

describe('DPS stat model', () => {
	const buckets = bucketsFrom(meter, WP)!;
	const input: ModelInput = { buckets, critRate: meter.critRate, mainStat: MS, weaponPower: WP, baseAttackPct: 10 };

	it('reads bucket totals back from the meter values', () => {
		expect(buckets.additionalDamage).toBeCloseTo(36.5, 1);
		expect(buckets.evoDamage).toBeCloseTo(79.9, 1);
		expect(buckets.ownAttack).toBeGreaterThan(0.9);
		expect(buckets.ownAttack).toBeLessThanOrEqual(1);
	});

	it('reproduces the meter values it was read from', () => {
		const m = modelMarginals(input);
		for (const key of ['additionalDamage', 'evoDamage', 'attackPowerPct', 'weaponPower', 'critDamage', 'critRate'] as const)
			expect(m[key]).toBeCloseTo(meter[key], 2);
	});

	it('shows diminishing returns on large changes', () => {
		const one = modelGain({ ...zero, additionalDamage: 1 }, input).gainPct!;
		const ten = modelGain({ ...zero, additionalDamage: 10 }, input).gainPct!;
		expect(ten).toBeCloseTo(10 * one, 6); // additive inside the bucket: linear
		const wp = modelGain({ ...zero, weaponPower: 1000 }, input).gainPct!;
		const wp50 = modelGain({ ...zero, weaponPower: 50_000 }, input).gainPct!;
		expect(wp50).toBeLessThan(50 * wp);
	});

	it('multiplies buckets and lists each part', () => {
		const g = modelGain({ ...zero, additionalDamage: 2, weaponPower: 5000 }, input);
		expect(g.parts.map(p => p.key)).toEqual(['attack', 'additionalDamage']);
		expect(g.gainPct).toBeCloseTo(((1 + g.parts[0].gainPct / 100) * (1 + g.parts[1].gainPct / 100) - 1) * 100, 10);
	});

	it('leaves crit rate unvalued without the gate\'s own values', () => {
		const g = modelGain({ ...zero, critRate: 3.4 }, { ...input, critRate: null });
		expect(g.gainPct).toBeNull();
		expect(g.missing[0]).toContain('Crit rate');
		expect(modelGain({ ...zero, critDamage: 5 }, { ...input, critRate: null }).gainPct).toBeCloseTo(5 * 0.375);
	});

	it('needs buckets for anything but crit rate', () => {
		expect(modelGain({ ...zero, weaponPower: 1 }, { ...input, buckets: null }).gainPct).toBeNull();
		expect(modelGain({ ...zero, critRate: 1 }, { ...input, buckets: null }).gainPct).toBeCloseTo(0.037);
	});

	it('takes buckets from the newest build and crit rate from the gate', () => {
		const run = (id: number, cp: number, boss: string, v: StatValues | null) => ({ id, start: id, boss, difficulty: 'Hard', combatPower: cp, statValues: v }) as unknown as RunSummary;
		const runs = [run(3, 4386, 'Serca', meter), run(2, 4380, 'Kazeros', { ...meter, additionalDamage: 0.7, critRate: 0.5 }), run(1, 4000, 'Kazeros', { ...meter, additionalDamage: 0.5 }), run(4, 4390, 'Serca', null)];
		expect(buildRuns(runs).map(r => r.id)).toEqual([3, 2]);
		const { input: m, gateValued } = modelInput(runs, runs.filter(r => r.boss === 'Kazeros'), MS, WP, 10);
		expect(m.critRate).toBeCloseTo((0.5 + 0.037) / 2, 6);
		expect(m.buckets!.additionalDamage).toBeCloseTo((1 / ((0.7326 + 0.7) / 2) - 1) * 100, 6);
		expect(gateValued).toBe(2);
		expect(modelInput(runs, runs.filter(r => r.id === 4), MS, WP, 10).input.critRate).toBeNull();
	});
});
