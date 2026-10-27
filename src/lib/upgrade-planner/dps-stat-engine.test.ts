import { describe, expect, it } from 'vitest';
import { changedContext, damageFactor, perStatGains, statGain, ZERO_DELTA, type DamageContext } from './dps-stat-engine';

export const context: DamageContext = {mainStat: 700000, weaponPower: 260000, baseAttackPct: 10,
	attackPowerPct: 5, flatAttack: 1000, supportAttack: 0, additionalDamage: 40, evolutionDamage: 80,
	critRate: 70, critDamage: 250, critCap: 100};
describe('damage gains without logs', () => {
	it('calculates finite per-stat gains with no run, skill shares or measured values', () => {
		const gains = perStatGains(context);
		expect(gains).toHaveLength(9);
		expect(gains.every((g) => g.gainPct !== null && g.gainPct > 0)).toBe(true);
		expect(statGain(context, ZERO_DELTA)).toBe(0);
	});
	it('uses additive totals and exact diminishing returns, rather than CP ratios', () => {
		expect(statGain(context, {...ZERO_DELTA, additionalDamage: 1})).toBeCloseTo(1 / 140 * 100, 10);
		expect(statGain(context, {...ZERO_DELTA, evolutionDamage: 1})).toBeCloseTo(1 / 180 * 100, 10);
		const c = {...context, flatAttack: 0};
		expect(statGain(c, {...ZERO_DELTA, weaponPower: 1000})).toBeCloseTo((Math.sqrt(261000 / 260000) - 1) * 100, 10);
	});
	it('values crit rate and crit damage jointly, crossing and saturating the cap', () => {
		expect(statGain(context, {...ZERO_DELTA, critRate: 1})).toBeCloseTo((2.065 / 2.05 - 1) * 100, 10);
		expect(statGain({...context, critRate: 100}, {...ZERO_DELTA, critRate: 5})).toBe(0);
		expect(statGain({...context, critRate: 99}, {...ZERO_DELTA, critRate: 5})).toBeCloseTo((2.5 / 2.485 - 1) * 100, 10);
		const both = statGain(context, {...ZERO_DELTA, critRate: 5, critDamage: 10});
		expect(both).toBeCloseTo(((1 + .75 * 1.6) / (1 + .7 * 1.5) - 1) * 100, 10);
	});
	it('models fixed support attack explicitly and lets it dilute main-stat gains', () => {
		const delta = {...ZERO_DELTA, mainStat: 10000};
		expect(statGain({...context, supportAttack: 50000}, delta)).toBeLessThan(statGain(context, delta)!);
		// The rate bucket multiplies both personal and support attack.
		expect(statGain({...context, supportAttack: 50000}, {...ZERO_DELTA, attackPowerPct: 1})).toBeCloseTo(statGain(context, {...ZERO_DELTA, attackPowerPct: 1})!, 10);
	});
	it('applies Basic flat attack before the base multiplier and accessory flat attack after it', () => {
		const c = {...context, baseAttackFlat: 3690, baseAttackPct: 20, supportAttack: 40000};
		const total = (Math.sqrt(c.mainStat * c.weaponPower / 6) + 3690) * 1.2 + c.flatAttack + 40000;
		expect(statGain(c, {...ZERO_DELTA, baseAttackFlat: 1000})).toBeCloseTo(1200 / total * 100, 10);
		expect(statGain(c, {...ZERO_DELTA, attackPower: 1000})).toBeCloseTo(1000 / total * 100, 10);
		expect(statGain(c, {...ZERO_DELTA, baseAttackFlat: -3691})).toBeNull();
	});
	it('handles configured crit-to-evolution conversion without adding it twice', () => {
		const c = {...context, critRate: 100, critConversion: {threshold: .8, ratio: 1.5, maxBonus: .6}};
		expect(statGain(c, {...ZERO_DELTA, critRate: 1})).toBeCloseTo(.015 / 2.1 * 100, 10);
		expect(statGain({...c, critRate: 140}, {...ZERO_DELTA, critRate: 1})).toBe(0);
	});
	it('compounds multiple upgrades and rejects invalid/incomplete combat contexts', () => {
		const a = {...ZERO_DELTA, mainStat: 10000}, b = {...ZERO_DELTA, additionalDamage: 5};
		const next = changedContext(context, a);
		expect((1 + statGain(context, a)! / 100) * (1 + statGain(next, b)! / 100)).toBeCloseTo(damageFactor(changedContext(next, b))! / damageFactor(context)!, 12);
		for (const c of [{...context, critDamage: undefined}, {...context, weaponPower: 0}, {...context, critCap: 101}, {...context, supportAttack: -1}])
			expect(damageFactor(c as DamageContext)).toBeNull();
		expect(statGain(context, {...ZERO_DELTA, mainStat: -context.mainStat})).toBeNull();
		expect(statGain(context, {...ZERO_DELTA, critRate: NaN})).toBeNull();
	});
});
