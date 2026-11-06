import { describe, expect, it } from 'vitest';
import roster from './fixtures/vambraces-cp-roster.json';
import shawtiezFixture from './fixtures/ce-shawtiez.json';
import yktraFixture from './fixtures/ce-yktra.json';
import { PartType, baselineParts, combatPower } from './cp';
import { simulationBaseline } from './roles';
import { initSimState, simulate } from './simulate';
import { supportCombatPower } from './support';
import type { Loadout } from './types';

// Public character responses loaded on 2026-10-26; only CP inputs and equipped Vambraces are retained.
const loadout = (name: keyof typeof roster) => structuredClone(roster[name]) as unknown as Loadout;

describe('released Vambraces baseline regression', () => {
	it.each([
		['Soulshann', 5610.81, 5676.22],
		['Shanzkii', 4339.96, 4363.34],
		['Ignishan', 4286.39, 4309.83]
	] as const)('%s reproduces the in-game score after including its missing flat Basic Attack Power', (name, before, expected) => {
		const l = loadout(name), original = structuredClone(l);
		expect(combatPower(l.battlePoint.parts).max).toBeCloseTo(before, 2);
		expect(combatPower(baselineParts(l)).max).toBeCloseTo(expected, 2);
		const base = initSimState(l);
		expect(simulate(l, base, base).cp).toBeCloseTo(expected, 2);
		expect(simulationBaseline(l).mismatch).toBe(false);
		expect(simulationBaseline(l).cp).toBe(expected);
		expect(l).toEqual(original);
	});
	it('keeps the character without Vambraces unchanged', () => {
		const l = loadout('Kamehameshaan');
		expect(baselineParts(l)).toBe(l.battlePoint.parts);
		expect(simulate(l, initSimState(l)).cp).toBeCloseTo(3817.03, 2);
	});
	it('does not add the flat contribution again after the upstream breakdown is fixed', () => {
		const l = loadout('Soulshann');
		l.battlePoint.parts = baselineParts(l);
		expect(baselineParts(l)).toBe(l.battlePoint.parts);
		expect(simulate(l, initSimState(l)).cp).toBeCloseTo(5676.22, 2);
	});
	it('preserves an unexplained base attack instead of adding an assumed missing bonus', () => {
		const l = loadout('Soulshann');
		l.battlePoint.parts.find((p) => p.type === PartType.BaseAttack)!.value! += 1000;
		expect(baselineParts(l)).toBe(l.battlePoint.parts);
	});
	it('does not reinterpret stat 114 on a character without Vambraces', () => {
		const l = loadout('Soulshann');
		l.items = [];
		expect(baselineParts(l)).toBe(l.battlePoint.parts);
	});
	it('keeps Soulshan\'s raid setup separate from its reported max-CP setup', () => {
		const l = loadout('Soulshan');
		expect(combatPower(baselineParts(l)).max).toBeCloseTo(7033.07, 2);
		expect(simulationBaseline(l)).toMatchObject({ reported: 7207.72, mismatch: true });
		expect(simulationBaseline(l).cp).toBeCloseTo(7033.07, 2);
	});
	it('corrects only support attack, preserving Shield & Heal Power and the recorded score anchor', () => {
		const l = loadout('Brushann');
		const before = supportCombatPower(l.battlePoint.parts), after = supportCombatPower(baselineParts(l));
		expect(after.buff).toBeGreaterThan(before.buff);
		expect(after.shieldHeal).toBe(before.shieldHeal);
		expect(simulationBaseline(l)).toMatchObject({ cp: 3623.26, reported: 3623.26, mismatch: false });
	});
	it('normalizes Shawtíez feast-buffed raid snapshot and matches reported score with Vambraces', () => {
		const l0 = structuredClone(shawtiezFixture.most_recent_raid) as unknown as Loadout;
		expect(combatPower(l0.battlePoint.parts).max).toBeCloseTo(2926.95, 2);
		expect(combatPower(baselineParts(l0)).max).toBeCloseTo(2975.91, 2);
		const base0 = initSimState(l0);
		expect(simulate(l0, base0, base0).cp).toBeCloseTo(2975.91, 2);
		expect(simulationBaseline(l0).mismatch).toBe(false);
		expect(simulationBaseline(l0).cp).toBe(2975.91);

		const l1 = structuredClone(shawtiezFixture.raid_merged) as unknown as Loadout;
		expect(combatPower(l1.battlePoint.parts).max).toBeCloseTo(6982.84, 2);
		expect(combatPower(baselineParts(l1)).max).toBeCloseTo(7099.63, 1);
		const base1 = initSimState(l1);
		expect(simulate(l1, base1, base1).cp).toBeCloseTo(7099.63, 1);
		expect(simulationBaseline(l1).mismatch).toBe(false);
		expect(simulationBaseline(l1).cp).toBe(7099.63);

		// Idempotency: baselineParts called again on stripped parts does not strip again
		l1.battlePoint.parts = baselineParts(l1);
		expect(baselineParts(l1)).toBe(l1.battlePoint.parts);
	});
	it('normalizes Yktra food-buffed snapshot to food-less baseline matching reported score', () => {
		const l = structuredClone(yktraFixture) as unknown as Loadout;
		expect(combatPower(l.battlePoint.parts).max).toBeCloseTo(5732.28, 2);
		expect(combatPower(baselineParts(l)).max).toBeCloseTo(5706.41, 2);
		const base = initSimState(l);
		expect(simulate(l, base, base).cp).toBeCloseTo(5706.41, 2);
		expect(simulationBaseline(l).mismatch).toBe(false);
		expect(simulationBaseline(l).cp).toBe(5706.41);

		// Idempotency
		l.battlePoint.parts = baselineParts(l);
		expect(baselineParts(l)).toBe(l.battlePoint.parts);
	});
});
