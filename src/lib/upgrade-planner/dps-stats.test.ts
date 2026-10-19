import { describe, expect, it } from 'vitest';
import soulshan from './fixtures/na-soulshan.json';
import { dpsGainPct, statDeltas, statDeltasAtLeast } from './dps-stats';
import { initSimState, simulate, type DpsLine } from './simulate';
import type { StatValues } from '$lib/logs/protocol';
import type { Loadout } from './types';

const loadout = soulshan as unknown as Loadout;
// Soulshan's meter values on Deskaluda (2026-10-10).
const values: StatValues = {
	runs: 1,
	additionalDamage: 0.668,
	critRate: 0.15,
	critDamage: 0.363,
	evoDamage: 0.453,
	attackPowerPct: 0.897,
	weaponPowerPct: 0.347,
	mainStat: 0.053,
	weaponPower: 0.159,
	attackPower: 0.37
};

describe('DPS from the meter stat values', () => {
	it('weapon honing is Weapon Power only', () => {
		const base = initSimState(loadout);
		const to = structuredClone(base);
		to.gear.weapon!.honing += 1;
		const d = statDeltas(loadout, base, to, base)!;
		const wp = simulate(loadout, to, base).weaponPower - simulate(loadout, base, base).weaponPower;
		expect(d.weaponPower).toBeCloseTo(wp, 6);
		expect(d.weaponPower).toBeGreaterThan(0);
		expect(d).toMatchObject({ mainStat: 0, additionalDamage: 0, critRate: 0, critDamage: 0, attackPowerPct: 0, attackPower: 0 });
		expect(dpsGainPct(d, values)).toBeCloseTo((wp / 1000) * values.weaponPower, 9);
	});

	it('counts accessory lines by their raw values', () => {
		const base = initSimState(loadout);
		const to = structuredClone(base);
		const neck = to.accessories.neck!;
		const i = neck.findIndex((ln) => ln.key === 'add_dmg');
		expect(i).toBeGreaterThanOrEqual(0);
		const before = (neck[i] as DpsLine).tier;
		neck[i] = { key: 'add_dmg', tier: 'high' };
		const step = { low: 70, mid: 160, high: 260 } as const;
		const d = statDeltas(loadout, base, to, base)!;
		expect(d.additionalDamage).toBeCloseTo((step.high - step[before]) / 100, 9);
		// Swapping the line for crit damage moves additional damage out and crit damage in.
		neck[i] = { key: 'crit_dmg', tier: 'mid' };
		const swap = statDeltas(loadout, base, to, base)!;
		expect(swap.additionalDamage).toBeCloseTo(-step[before] / 100, 9);
		expect(swap.critDamage).toBeCloseTo(2.4, 9);
	});

	it('values the covered part of an upgrade that also raises Outgoing Damage, as a lower bound', () => {
		const base = initSimState(loadout);
		const neck = base.accessories.neck!;
		const add = neck.findIndex((ln) => ln.key === 'add_dmg'), out = neck.findIndex((ln) => ln.key === 'outgoing_dmg');
		expect(add).toBeGreaterThanOrEqual(0);
		expect(out).toBeGreaterThanOrEqual(0);
		const low = structuredClone(base);
		low.accessories.neck![out] = { key: 'outgoing_dmg', tier: 'low' };
		low.accessories.neck![add] = { key: 'add_dmg', tier: 'low' };
		const high = structuredClone(low);
		high.accessories.neck![out] = { key: 'outgoing_dmg', tier: 'high' };
		high.accessories.neck![add] = { key: 'add_dmg', tier: 'high' };
		// The exact version gives up on any Outgoing Damage change.
		expect(statDeltas(loadout, low, high, base)).toBeNull();
		const up = statDeltasAtLeast(loadout, low, high, base)!;
		expect(up.unvalued).toEqual(['Outgoing Damage']);
		expect(up.delta.additionalDamage).toBeCloseTo((260 - 70) / 100, 9);
		// Losing Outgoing Damage would make the covered part an overestimate: no figure.
		expect(statDeltasAtLeast(loadout, high, low, base)).toBeNull();
		// Without an Outgoing Damage change it's the exact figure.
		const plain = structuredClone(low);
		plain.accessories.neck![add] = { key: 'add_dmg', tier: 'high' };
		expect(statDeltasAtLeast(loadout, low, plain, base)).toEqual({ delta: statDeltas(loadout, low, plain, base), unvalued: [] });
	});

	it('weapon quality is additional damage', () => {
		const base = initSimState(loadout);
		const to = structuredClone(base);
		to.quality.weapon = 90;
		const d = statDeltas(loadout, base, to, base)!;
		// 100 → 30%; 90 → 1000 + 2000 × 0.81 = 2620 → 26.2%.
		expect(d.additionalDamage).toBeCloseTo(-3.8, 9);
	});

	it('gives no figure for changes the values do not cover', () => {
		const base = initSimState(loadout);
		const to = structuredClone(base);
		const id = Number(Object.keys(to.engravings)[0]);
		to.engravings[id].stone = (to.engravings[id].stone + 1) % 5;
		expect(statDeltas(loadout, base, to, base)).toBeNull();
		const gem = structuredClone(base);
		gem.gems[0].level = Math.max(1, gem.gems[0].level - 1);
		expect(statDeltas(loadout, base, gem, base)).toBeNull();
		// Damage shares loaded from logs aren't a gear change.
		const shares = structuredClone(base);
		shares.skillShares = { 1: 50 };
		expect(statDeltas(loadout, base, shares, base)).toEqual({ mainStat: 0, weaponPower: 0, additionalDamage: 0, critRate: 0, critDamage: 0, attackPowerPct: 0, attackPower: 0 });
	});
});
