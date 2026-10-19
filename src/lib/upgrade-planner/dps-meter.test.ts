import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import soulshan from './fixtures/na-soulshan.json';
import type { Loadout } from './types';
import { initSimState } from './simulate';
import { engravingNames } from './dps-loadout';
import { gemMembers } from './dps-explain';
import { dpsMeter, matchSnapshot, sameGear } from './dps-meter';

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

describe('clear baseline', () => {
	it('matches a snapshot within 0.5% CP, closest first', () => {
		const snaps = [{ id: 'a', cp: 6100 }, { id: 'b', cp: 6020 }, { id: 'c', cp: 6005 }];
		expect(matchSnapshot(6000, snaps)?.id).toBe('c');
		expect(matchSnapshot(5000, snaps)).toBeNull();
		expect(matchSnapshot(null, snaps)).toBeNull();
	});
	it('same gear: same loadout hash, else CP within 0.5%, same gate only', () => {
		expect(sameGear(run(1, { loadoutHash: 'x' }), run(2, { loadoutHash: 'x', combatPower: 6200 }))).toBe(true);
		expect(sameGear(run(1, { loadoutHash: 'x' }), run(2, { loadoutHash: 'y' }))).toBe(false);
		expect(sameGear(run(1), run(2, { combatPower: 6020 }))).toBe(true);
		expect(sameGear(run(1), run(2, { combatPower: 6100 }))).toBe(false);
		expect(sameGear(run(1), run(2, { boss: 'Other' }))).toBe(false);
	});
});
