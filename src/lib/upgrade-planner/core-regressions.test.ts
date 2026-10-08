import { describe, expect, it } from 'vitest';
import { PartType } from './cp';
import soulshan from './fixtures/na-soulshan.json';
import brushann from './fixtures/na-brushann.json';
import { initSimState, simCoreValue, simulate } from './simulate';
import { supportCoreValue } from './support';
import { coreValue, decodeCore } from './tables';
import { coreStates, coreValueAs, coreValueAt, weaponPowerOf } from './upgrades';
import type { Loadout } from './types';

describe('support core grade caps', () => {
	it('retains heroic and legendary Buff Power when points exceed their activation caps', () => {
		expect(supportCoreValue(673003033, 9).value).toBe(0);
		expect(supportCoreValue(673003033, 10).value).toBe(120);
		for (const points of [14, 17, 18, 19, 20, 25])
			expect(supportCoreValue(673003033, points).value).toBe(120);
		expect(supportCoreValue(673003034, 14).value).toBe(120);
		for (const points of [17, 18, 19, 20, 25])
			expect(supportCoreValue(673003034, points).value).toBe(120);
	});

	it('caps Shield & Heal Power cores on the correct side', () => {
		expect(supportCoreValue(673122003, 9)).toEqual({ value: 0, defense: true });
		expect(supportCoreValue(673122003, 17)).toEqual({ value: 84, defense: true });
		expect(supportCoreValue(673122004, 10)).toEqual({ value: 84, defense: true });
		expect(supportCoreValue(673122004, 20)).toEqual({ value: 168, defense: true });
	});
});

describe('inactive cores do not retain imported corrections', () => {
	it('turns a corrected weapon core off below 10P, including after a grade swap', () => {
		const l = structuredClone(soulshan) as unknown as Loadout;
		const core = l.arkGridCores!.find((c) => String(c.id).startsWith('67312'))!;
		const part = l.battlePoint.parts.find((p) => p.type === PartType.ArkGridCore && p.id === core.id)!;
		core.id = part.id = 673121005;
		part.points = core.gems.reduce((sum, g) => sum + g.corePoints, 0);
		const wp = weaponPowerOf(l);
		part.value = coreValue(decodeCore(core.id)!, part.points as number, wp) + 100;
		const c = coreStates(l).find((c) => c.id === core.id)!;
		expect(coreValueAt(c, 9, wp)).toBe(0);
		expect(coreValueAs(c, decodeCore(673121006)!, 9, wp)).toBe(0);
		expect(coreValueAt(c, c.points, wp)).toBe(part.value);
		const base = initSimState(l);
		const s = structuredClone(base);
		const edited = s.arkGrid.find((c) => c.id === core.id)!;
		edited.gems.forEach((g) => g.corePoints = 2);
		for (const grade of [undefined, 'ancient'] as const) {
			edited.grade = grade;
			expect(simulate(l, s, base).parts.find((p) => p.id === core.id)?.value).toBe(0);
		}
	});

	it('also removes a support import correction when the core deactivates', () => {
		const l = brushann as unknown as Loadout;
		const c = { ...coreStates(l)[0] };
		c.value = c.modelValue + 100;
		expect(simCoreValue(c, undefined, 9, weaponPowerOf(l)).value).toBe(0);
		expect(simCoreValue(c, undefined, c.points, weaponPowerOf(l)).value).toBe(c.value);
	});
});
