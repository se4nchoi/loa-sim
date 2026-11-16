import { describe, expect, it } from 'vitest';
import soulshan from './fixtures/na-soulshan.json';
import { braceletPart, dpsGainPct, statDeltas, statDeltasAtLeast, braceletEffectsUptime, rampStacks, TYPICAL_BRACELET_SHARE } from './dps-stats';
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
	it('keeps vambrace Basic attack separate from accessory flat attack', () => {
		const base = initSimState(loadout); base.bracer = {grade: 'epic', honing: 4};
		const to = structuredClone(base); to.bracer!.honing = 5;
		const d = statDeltas(loadout, base, to, base)!;
		expect(d.baseAttackFlat).toBe(850);
		expect(d.attackPower).toBe(0);
		expect(dpsGainPct(d, values, 20)).toBeCloseTo(850 * 1.2 / 1000 * values.attackPower, 10);
	});
	it('separates species damage from Additional Damage and keeps stagger damage unvalued', () => {
		const demon = braceletPart('3:11041')!;
		expect(demon.stats.additionalDamage).toBe(3.5);
		expect(demon.demon).toBe(2.5);
		expect(demon.unvalued).toEqual([]);
		const stagger = braceletPart('4:605100031')!;
		expect(stagger.outgoing).toBe(3);
		expect(stagger.unvalued).toEqual(["Outgoing Damage +5% to Staggered foes (stagger isn't logged)"]);
	});
	it('values timed bracelet lines at their uptime and lists what the logs cannot show', () => {
		const uptime = { share: (f: number) => ({ 7: 0.8, 9: 0.5, 10: 0.9, 11: 0.75, 12: 0.6 })[f] ?? 0, stacks: () => 4 };
		expect(braceletPart('3:11111', uptime)!.stats.weaponPower).toBeCloseTo(2400 * 0.75, 9);
		expect(braceletPart('3:11121', uptime)!.stats.weaponPower).toBeCloseTo(150 * 4 * 0.6, 9);
		expect(braceletPart('4:605100101', uptime)!.stats.weaponPower).toBeCloseTo(1480 * 6 * 0.9, 9);
		expect(braceletPart('3:11071', uptime)!.stats.critRate).toBeCloseTo(2.5 * 0.8, 9);
		expect(braceletPart('3:11091', uptime)!.stats.critDamage).toBeCloseTo(4.8 * 0.5, 9);
		expect(braceletPart('3:11061', uptime)!.unvalued).toEqual(['Boss Defense -2.5% (boss Defense unknown)']);
		const cooldown = braceletPart('3:11051')!;
		expect(cooldown.outgoing).toBe(5.5);
		expect(cooldown.unvalued).toEqual([]);
	});
	it('pools the runs’ bracelet uptime, typical for effects they did not have', () => {
		const runs = [
			{ damage: 100, duration: 300_000, braceletUptime: { 11: { damage: 90 }, 12: { damage: 50, stacks: 4 } } },
			{ damage: 300, duration: 300_000, braceletUptime: { 11: { damage: 250 }, 12: { damage: 100, stacks: 7 } } }
		];
		const u = braceletEffectsUptime(runs);
		expect(u.typical).toBe(false);
		expect(u.share(11)).toBeCloseTo(340 / 400, 9);
		expect(u.share(7)).toBe(TYPICAL_BRACELET_SHARE);
		expect(u.stacks(12)).toBeCloseTo((4 * 50 + 7 * 100) / 150, 9);
		expect(braceletEffectsUptime([{ damage: 1, duration: 60_000 }]).stacks(12)).toBeCloseTo(rampStacks(60_000), 9);
		expect(rampStacks(90_000)).toBeCloseTo(2, 9);
	});
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
