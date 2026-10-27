import { describe, expect, it } from 'vitest';
import { combatStatWindows } from './combat-stat-windows';
import { COMBAT_STAT_BUFFS } from './combat-stat-buffs';

const hit = (damage: number, crit: boolean, buffedBy: number[] = []) => ({damage, crit, buffedBy});
describe('combat stat windows', () => {
	it('retains damage-weighted intersections rather than assuming independent buff uptimes', () => {
		const windows = combatStatWindows([{hits: [hit(30, false), hit(20, true, [32380]), hit(50, true, [32380, 523433, 962210])]}], 100, 70)!;
		expect(windows.map(w => [w.damage, w.critDamage, w.attackPowerPct])).toEqual([[30, 0, 0], [20, 20, 30], [50, 50, 44.8]]);
	});
	it('resolves composed identifiers using their source skill and counts each buff once', () => {
		const composed = 1_000_000_000 + 962210 + 96220;
		const windows = combatStatWindows([{hits: [hit(100, true, [composed, 962210, composed, 460501])]}], 100, 100, {[composed]: 96220})!;
		expect(windows[0]).toMatchObject({attackPowerPct: 2, states: [460501]});
		expect(combatStatWindows([{hits: [hit(100, true, [composed])]}], 100, 100)![0].attackPowerPct).toBeUndefined();
	});
	it('does not guess buff levels, stacks or unidentified effects', () => {
		for (const id of [922040, 999_999_999])
			expect(combatStatWindows([{hits: [hit(100, true, [id])]}], 100, 100)![0].attackPowerPct).toBeUndefined();
		const stacking = Number(Object.entries(COMBAT_STAT_BUFFS).find(([, v]) => !v.fromGear && v.ap && (v.stacks ?? 1) > 1)![0]);
		expect(combatStatWindows([{hits: [hit(100, true, [stacking])]}], 100, 100)![0].attackPowerPct).toBeUndefined();
	});
	it('does not count full-stack engravings twice or turn support flat attack into Atk. Power %', () => {
		const engraving = Number(Object.entries(COMBAT_STAT_BUFFS).find(([, v]) => v.fromGear)![0]);
		expect(combatStatWindows([{hits: [hit(100, true, [engraving, 211607])]}], 100, 100)![0].attackPowerPct).toBe(0);
	});
	it('refuses incomplete, malformed or inconsistent damage traces', () => {
		expect(combatStatWindows(undefined, 100, 0)).toBeUndefined();
		expect(combatStatWindows([{hits: [hit(90, false)]}], 100, 0)).toBeUndefined();
		expect(combatStatWindows([{hits: [hit(100, false)]}], 100, 50)).toBeUndefined();
		expect(combatStatWindows([{hits: [hit(100, true)]}], 100, NaN)).toBeUndefined();
		expect(combatStatWindows([{hits: [{damage: 100, crit: true}]}], 100, 100)).toBeUndefined();
		expect(combatStatWindows([{hits: [hit(-10, true), hit(110, true)]}], 100, 100)).toBeUndefined();
	});
});
