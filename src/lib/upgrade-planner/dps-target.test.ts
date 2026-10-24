import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import soulshan from './fixtures/na-soulshan.json';
import { engravingNames } from './dps-loadout';
import { liveUpgrades } from './live-upgrades';
import { groupSteps, parseTargetDps, planToTarget } from './dps-target';
import { initSimState } from './simulate';
import type { Loadout } from './types';

const loadout = soulshan as unknown as Loadout;
const base = initSimState(loadout);
const values = { runs: 1, additionalDamage: .73, evoDamage: .56, attackPowerPct: .85, weaponPowerPct: .33, critRate: .15, critDamage: .36, mainStat: .055, weaponPower: .16, attackPower: .4 };
const run = { id: 1, start: 1, boss: 'Death Incarnate Kazeros', difficulty: 'Hard', cleared: true, player: 'Soulshan', duration: 100_000,
	combatPower: 6000, itemLevel: 1784, spec: null, engravings: engravingNames(loadout), damage: 1e11,
	skills: [{ id: 46430, damage: 6e10, critDamage: 0, hits: 1, crits: 0, casts: 1 }, { id: 99999, damage: 4e10, critDamage: 0, hits: 1, crits: 0, casts: 1 }],
	statValues: values, critConversion: false, meterVersion: null } as unknown as RunSummary;
const selection = { baseline: base, buildRuns: [run], runs: [run] };
const startDps = 1e11 / 100;
const options = (targetDps: number, byGold: boolean) => ({
	loadout, base, start: base, selection, targetDps, byGold,
	upgradesFor: (s: typeof base) => liveUpgrades(loadout, s, base, undefined, true),
	// Honing costs 1000 a step, gems 5000; everything else unpriced.
	goldFor: (u: { category: string }) => (u.category === 'honing' ? 1000 : u.category === 'gem' ? 5000 : null)
});

describe('target DPS', () => {
	it('reads targets as DPS or as a percent of now', () => {
		expect(parseTargetDps('1.4b', 1e9)).toBe(1.4e9);
		expect(parseTargetDps('1,400m', 1e9)).toBe(1.4e9);
		expect(parseTargetDps('+5%', 1e9)).toBeCloseTo(1.05e9);
		expect(parseTargetDps('soon', 1e9)).toBeNull();
	});

	it('reaches a target in steps, each measured on the meter after the ones before', () => {
		const plan = planToTarget(options(startDps * 1.02, false))!;
		expect(plan.startDps).toBeCloseTo(startDps);
		expect(plan.reached).toBe(true);
		expect(plan.endDps).toBeGreaterThanOrEqual(startDps * 1.02);
		let dps = plan.startDps;
		for (const s of plan.steps) {
			expect(s.dps).toBeCloseTo(dps * (1 + s.gainPct / 100), 0);
			dps = s.dps;
		}
	});

	it('by gold, only priced upgrades are used and the gold adds up', () => {
		const plan = planToTarget(options(startDps * 1.01, true))!;
		expect(plan.steps.every((s) => s.gold !== null && ['honing', 'gem'].includes(s.upgrade.category))).toBe(true);
		expect(plan.gold).toBe(plan.steps.reduce((t, s) => t + (s.gold ?? 0), 0));
		expect(plan.unpriced).toBeGreaterThan(0);
	});

	it('stops when nothing more helps, without reaching an impossible target', () => {
		const plan = planToTarget({ ...options(startDps * 10, false), maxSteps: 3 })!;
		expect(plan.reached).toBe(false);
		expect(plan.steps.length).toBeLessThanOrEqual(3);
	});
});

describe('plan steps grouped', () => {
	it('puts consecutive steps on one item on one line, gains compounded and gold added', () => {
		const step = (subject: string, gainPct: number, gold: number | null) => ({ upgrade: { subject, category: 'honing', title: subject } as never, gainPct, gold, dps: 1 });
		const groups = groupSteps([step('Weapon', 1, 100), step('Vambraces', 1, 10), step('Vambraces', 1, 20), step('Weapon', 2, null)]);
		expect(groups.map((g) => g.count)).toEqual([1, 2, 1]);
		expect(groups[1].gainPct).toBeCloseTo(2.01);
		expect(groups[1].gold).toBe(30);
	});
});
