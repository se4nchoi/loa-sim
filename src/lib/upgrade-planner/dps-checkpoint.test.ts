import { describe, expect, it } from 'vitest';
import { checkpointEstimate } from './dps-checkpoint';
import { configuredPlanGain } from './dps-configured';
import { initSimState, simulate } from './simulate';
import { baseAttackOf } from './dps-explain';
import { type DamageContext } from './dps-stat-engine';
import type { ReplayRun } from '$lib/logs/protocol';
import type { Loadout } from './types';
import fixture from './fixtures/na-soulshan.json';

const l = fixture as unknown as Loadout, base = initSimState(l), stats = simulate(l, base, base);
const context: DamageContext = {mainStat: stats.mainStat, weaponPower: stats.weaponPower, baseAttackPct: baseAttackOf(l, base),
	attackPowerPct: 0, flatAttack: 0, supportAttack: 0, additionalDamage: 40, evolutionDamage: 80, critRate: 70, critDamage: 200, critCap: 100};
const run = {id: 1, player: 'Soulshan', cleared: false, start: 1, duration: 3000, totalDamage: 400,
	hits: [
		{skill: 1, timestamp: 0, damage: 100, crit: false, hyper: false},
		{skill: 1, timestamp: 1000, damage: 100, crit: false, hyper: false},
		{skill: 1, timestamp: 2000, damage: 100, crit: false, hyper: false},
		{skill: 2, timestamp: 1500, damage: 100, crit: false, hyper: true}
	]} as ReplayRun;
describe('failed-pull checkpoint estimates', () => {
	it('uses only recorded hits in the half-open window and preserves the unchanged baseline', () => {
		const result = checkpointEstimate(run, 1000, 2000, 250, l, base, base)!;
		expect(result.observed).toBe(200);
		expect(result.estimated).toBe(200);
		expect(result.remaining).toBe(50);
		expect(result.coveragePct).toBe(100);
	});
	it('estimates supported upgrades from configured totals without any measured stat values', () => {
		const next = structuredClone(base); next.gear.weapon!.honing++;
		const gain = configuredPlanGain(l, base, base, next, context)!;
		expect(gain).toBeGreaterThan(0);
		const result = checkpointEstimate(run, 1000, 2000, 250, l, base, next, context)!;
		// Hyper Awakening damage is fixed; only the ordinary recorded hit scales.
		expect(result.estimated).toBeCloseTo(100 + 100 * (1 + gain / 100), 8);
		expect(checkpointEstimate(run, 1000, 2000, 250, l, base, next)!.estimated).toBeNull();
	});
	it('does not extend a failed attempt or invent damage from missing timestamps', () => {
		expect(checkpointEstimate(run, 0, 4000, 250, l, base, base)).toBeNull();
		expect(checkpointEstimate(run, 1000, 1000, 250, l, base, base)).toBeNull();
		expect(checkpointEstimate(run, 0, 2000, 0, l, base, base)).toBeNull();
		const partial = {...run, totalDamage: 800};
		const result = checkpointEstimate(partial, 1000, 2000, 250, l, base, base)!;
		expect(result.estimated).toBe(200);
		expect(result.coveragePct).toBe(50);
		expect(result.notes.join(' ')).toContain('missing damage');
	});
	it('leaves cooldown and unmodeled build changes unknown within a fixed window', () => {
		const cooldown = structuredClone(base), index = cooldown.gems.findIndex((g) => g.kind === 'cooldown' && g.level < 10);
		cooldown.gems[index].level++;
		expect(checkpointEstimate(run, 0, 2000, 250, l, base, cooldown, context)!.estimated).toBeNull();
		const unsupported = structuredClone(base); unsupported.karma.evolution = 1;
		expect(checkpointEstimate(run, 0, 2000, 250, l, base, unsupported, context)!.estimated).toBeNull();
		expect(configuredPlanGain(l, base, base, unsupported, context)).toBeNull();
	});
	it('prices successive stat upgrades against the current edited state', () => {
		const first = structuredClone(base), next = structuredClone(base);
		first.gear.head!.honing++; next.gear.head!.honing += 2;
		const a = configuredPlanGain(l, base, base, first, context)!;
		const b = configuredPlanGain(l, base, first, next, context)!;
		const total = configuredPlanGain(l, base, base, next, context)!;
		expect((1 + a / 100) * (1 + b / 100)).toBeCloseTo(1 + total / 100, 10);
	});
});
