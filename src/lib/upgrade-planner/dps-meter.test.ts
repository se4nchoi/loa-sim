import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import soulshan from './fixtures/na-soulshan.json';
import type { Loadout } from './types';
import { initSimState } from './simulate';
import { engravingNames } from './dps-loadout';
import { gemMembers } from './dps-explain';
import { dpsMeter, matchSnapshot, meterGain } from './dps-meter';

const loadout = soulshan as unknown as Loadout;
const base = initSimState(loadout);
const meter = { runs: 1, additionalDamage: .73, evoDamage: .56, attackPowerPct: .85, weaponPowerPct: .33, critRate: .15, critDamage: .36, mainStat: .055, weaponPower: .16, attackPower: .4 };
const damageGem = base.gems.findIndex((g) => g.kind === 'damage' && g.skill !== null && g.level < 10);
const gemSkill = gemMembers(base.gems[damageGem].skill!)[0];
const run = (id: number, extra: Partial<RunSummary> = {}): RunSummary => ({ id, start: id, boss: 'Death Incarnate Kazeros', difficulty: 'Hard', cleared: true, player: 'Soulshan', duration: 300_000,
	combatPower: 6000, itemLevel: 1784, spec: null, engravings: engravingNames(loadout), damage: 1000,
	skills: [{ id: gemSkill, damage: 600, critDamage: 0, hits: 1, crits: 0, casts: 1 }, { id: 99999, damage: 400, critDamage: 0, hits: 1, crits: 0, casts: 1 }],
	statValues: meter, critConversion: false, meterVersion: null, ...extra }) as RunSummary;

describe('DPS meter', () => {
	it('uses configured totals for a failed pull with no log stat values', () => {
		const context = {mainStat: 700000, weaponPower: 260000, baseAttackPct: 10, attackPowerPct: 0,
			flatAttack: 0, supportAttack: 0, additionalDamage: 40, evolutionDamage: 80, critRate: 70, critDamage: 200, critCap: 100};
		const failed = run(1, {cleared: false, statValues: null});
		const state = structuredClone(base); state.gear.weapon!.honing++;
		const m = dpsMeter(loadout, base, state, [], [failed], undefined, context)!;
		expect(m.statPct).toBeGreaterThan(0);
		expect(m.after).toBeGreaterThan(m.before);
		expect(meterGain(loadout, base, base, state, [], [failed], undefined, undefined, context).gainPct).toBeCloseTo(m.statPct!, 8);
		const conversionRun = {...failed, critConversion: true};
		// Unknown crit conversion does not block attack-only changes: that unchanged bucket cancels.
		expect(dpsMeter(loadout, base, state, [], [conversionRun], undefined, context)!.statPct).toBeGreaterThan(0);
	});
	it('keeps recorded Hyper Awakening damage fixed under an ordinary honing upgrade', () => {
		const state = structuredClone(base); state.gear.weapon!.honing++;
		const ordinary = run(1);
		const mixed = {...ordinary, skills: ordinary.skills.map((s, i) => ({...s, hyper: i === 1}))};
		const full = dpsMeter(loadout, base, state, [ordinary], [ordinary])!;
		const result = dpsMeter(loadout, base, state, [ordinary], [mixed])!;
		expect(result.skills.find((s) => s.id === 99999)!.after).toBe(400);
		expect(result.statPct).toBeCloseTo(full.statPct! * .6, 9);
		expect((result.after / result.before - 1) * 100).toBeCloseTo(result.statPct!, 9);
	});
	it('shows the recorded clear unchanged without edits', () => {
		const m = dpsMeter(loadout, base, base, [run(1)], [run(1)])!;
		expect(m.after).toBeCloseTo(m.before);
		expect(m.durationMs).toBe(300_000);
		expect(m.notInMeter).toEqual([]);
		expect(m.statPct).toBe(0);
	});
	it('a stat edit scales every skill by the same amount', () => {
		const state = structuredClone(base);
		state.gear.weapon!.honing += 1;
		const m = dpsMeter(loadout, base, state, [run(1)], [run(1)])!;
		expect(m.statPct!).toBeGreaterThan(0);
		const [a, b] = m.skills;
		expect(a.after / a.before).toBeCloseTo(b.after / b.before, 9);
		expect(m.after / m.before - 1).toBeCloseTo(m.statPct! / 100, 9);
	});
	it("a damage gem moves only its skills (plus a T4 gem's base attack for all)", () => {
		const state = structuredClone(base);
		state.gems[damageGem].level += 1;
		const m = dpsMeter(loadout, base, state, [run(1)], [run(1)])!;
		const gem = m.skills.find((s) => s.id === gemSkill)!, other = m.skills.find((s) => s.id === 99999)!;
		expect(gem.after / gem.before).toBeGreaterThan(other.after / other.before);
		expect(other.after).toBeGreaterThanOrEqual(other.before);
	});
	it('a cooldown gem adds casts as far as its skill sat on cooldown', () => {
		const index = base.gems.findIndex((g) => g.kind === 'cooldown' && g.skill !== null && g.level < 10);
		if (index < 0) return;
		const skill = gemMembers(base.gems[index].skill!)[0];
		const state = structuredClone(base);
		state.gems[index].level += 1;
		const withUse = (available: number) => run(1, { skills: [{ id: skill, damage: 600, critDamage: 0, hits: 1, crits: 0, casts: 1, timeAvailable: available }, { id: 99999, damage: 400, critDamage: 0, hits: 1, crits: 0, casts: 1 }] });
		const busy = dpsMeter(loadout, base, state, [run(1)], [withUse(0)])!, idle = dpsMeter(loadout, base, state, [run(1)], [withUse(300_000)])!;
		const ratio = (m: NonNullable<ReturnType<typeof dpsMeter>>, id: number) => { const s = m.skills.find((x) => x.id === id)!; return s.after / s.before; };
		expect(ratio(busy, skill)).toBeGreaterThan(ratio(busy, 99999) * 1.01);
		expect(ratio(idle, skill)).toBeCloseTo(ratio(idle, 99999), 9);
		expect(dpsMeter(loadout, base, state, [run(1)], [run(1)])!.notInMeter).toEqual(['Cooldown gems without cooldown data (1)']);
	});
	it("lists edits it doesn't count yet and leaves them out", () => {
		const state = structuredClone(base);
		if (state.karma.evolution !== null) state.karma.evolution = Math.min(30, state.karma.evolution + 1);
		else state.karma.leap = (state.karma.leap ?? 0) + 1;
		const m = dpsMeter(loadout, base, state, [run(1)], [run(1)])!;
		expect(m.notInMeter).toEqual(['Karma']);
		expect(m.after).toBeCloseTo(m.before);
	});
	it('sums several clears and their fight time', () => {
		const m = dpsMeter(loadout, base, base, [run(1), run(2)], [run(1), run(2)])!;
		expect(m.before).toBe(2000);
		expect(m.durationMs).toBe(600_000);
	});
});

describe('meter gain (Next Upgrades in DPS mode)', () => {
	it('is the change on the same meter, from the current edits', () => {
		const from = structuredClone(base);
		from.gems[damageGem].level += 1;
		const to = structuredClone(from);
		to.gear.weapon!.honing += 1;
		const g = meterGain(loadout, base, from, to, [run(1)], [run(1)]);
		const a = dpsMeter(loadout, base, from, [run(1)], [run(1)])!, b = dpsMeter(loadout, base, to, [run(1)], [run(1)])!;
		expect(g.gainPct!).toBeGreaterThan(0);
		expect(g.gainPct!).toBeCloseTo((b.after / a.after - 1) * 100, 9);
		expect(g.atLeast).toBe(false);
	});
	it("is unknown, not zero, for an edit the meter doesn't value", () => {
		const to = structuredClone(base);
		if (to.karma.evolution !== null) to.karma.evolution = Math.min(30, to.karma.evolution + 1);
		else to.karma.leap = (to.karma.leap ?? 0) + 1;
		expect(meterGain(loadout, base, base, to, [run(1)], [run(1)]).gainPct).toBeNull();
	});
	it("is unknown for a stat edit when no clear has the meter's stat values", () => {
		const to = structuredClone(base);
		to.gear.weapon!.honing += 1;
		const bare = run(1, { statValues: undefined });
		expect(meterGain(loadout, base, base, to, [bare], [bare]).gainPct).toBeNull();
	});
});

describe('clear baseline', () => {
	it('matches a snapshot within 0.5% CP, closest first', () => {
		const snaps = [{ id: 'a', cp: 6100 }, { id: 'b', cp: 6020 }, { id: 'c', cp: 6005 }];
		expect(matchSnapshot(6000, snaps)?.id).toBe('c');
		expect(matchSnapshot(5000, snaps)).toBeNull();
		expect(matchSnapshot(null, snaps)).toBeNull();
	});
});
