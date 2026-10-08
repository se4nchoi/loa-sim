import { describe, expect, it } from 'vitest';
import { PartType } from './cp';
import soulshan from './fixtures/na-soulshan.json';
import brushann from './fixtures/na-brushann.json';
import drkuuljulian from './fixtures/ce-drkuuljulian.json';
import { initSimState, simCoreValue, simulate } from './simulate';
import { supportCoreValue } from './support';
import { coreValue, decodeCore } from './tables';
import { buildUpgrades, coreStates, coreValueAs, coreValueAt, evaluateAstrogemSwap, weaponPowerOf } from './upgrades';
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
	it('turns a corrected core off below 10P, including after a grade swap', () => {
		const l = structuredClone(soulshan) as unknown as Loadout;
		const core = l.arkGridCores!.find((c) => String(c.id).startsWith('67312'))!;
		const part = l.battlePoint.parts.find((p) => p.type === PartType.ArkGridCore && p.id === core.id)!;
		core.id = part.id = 673120005;
		part.points = core.gems.reduce((sum, g) => sum + g.corePoints, 0);
		const wp = weaponPowerOf(l);
		part.value = coreValue(decodeCore(core.id)!, part.points as number, wp) + 100;
		const c = coreStates(l).find((c) => c.id === core.id)!;
		expect(coreValueAt(c, 9, wp)).toBe(0);
		expect(coreValueAs(c, decodeCore(673120006)!, 9, wp)).toBe(0);
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

describe('Drkuuljulian dealer Weapon core', () => {
	const l = drkuuljulian as unknown as Loadout;
	const base = initSimState(l);
	const before = simulate(l, base, base);
	const c = coreStates(l).find((c) => c.id === 673121006)!;
	const edited = (s: typeof base) => s.arkGrid.find((x) => x.id === c.id)!;

	it('imports an active 17P Weapon core without a separate battle-point part', () => {
		expect(c.points).toBe(17);
		expect(c.value).toBe(0);
		expect(l.battlePoint.parts.some((p) => p.id === c.id)).toBe(false);
		expect(before.weaponPower).toBe(276155);
		expect(before.parts).toEqual(l.battlePoint.parts);
	});

	it('removes the Weapon stats when swapping to Relic Attack', () => {
		const s = structuredClone(base);
		edited(s).grade = 'relic';
		edited(s).variant = 0;
		const after = simulate(l, s, base);
		expect(after.weaponPower).toBeLessThan(before.weaponPower);
		// +6% earrings, +3% karma, +3% core; remove the core's +5,200 and +3%.
		expect(after.weaponPower).toBeCloseTo((276155 / 1.12 - 5200) * 1.09, 8);
		expect(after.parts.find((p) => p.id === c.id)?.value).toBe(250);
		// At this character's high Weapon Power, Relic Attack narrowly wins, rather than gaining 2.5%.
		expect((after.cp / before.cp - 1) * 100).toBeGreaterThan(0);
		expect((after.cp / before.cp - 1) * 100).toBeLessThan(0.1);
		// The only CP changes are the lost base Weapon Power and the new +2.5% Attack part.
		expect(after.cp / before.cp).toBeCloseTo(Math.sqrt(after.weaponPower / before.weaponPower) * 1.025, 10);
	});

	it('loses base attack below 17P and below activation, without negative core multipliers', () => {
		const s = structuredClone(base);
		edited(s).gems[0].corePoints--;
		const sixteen = simulate(l, s, base);
		edited(s).gems.forEach((g) => g.corePoints = 2);
		const inactive = simulate(l, s, base);
		expect(sixteen.cp).toBeLessThan(before.cp);
		expect(inactive.cp).toBeLessThan(sixteen.cp);
		expect(inactive.parts.find((p) => p.id === c.id)?.value).toBe(0);
	});

	it('agrees on the next Weapon breakpoint in simulation, upgrades and gem swaps', () => {
		const s = structuredClone(base);
		edited(s).gems[1].corePoints++;
		const after = simulate(l, s, base);
		const gain = (after.cp / before.cp - 1) * 100;
		expect(gain).toBeGreaterThan(0);
		expect(after.parts.find((p) => p.id === c.id)?.value).toBe(0);
		expect(buildUpgrades(l).find((u) => u.key === `core:${c.id}:18`)?.gainPct).toBeCloseTo(gain, 10);
		const gem = c.gems[1];
		expect(evaluateAstrogemSwap(l, c.index, gem.idx, { corePoints: gem.corePoints + 1, opts: gem.opts })?.gainPct).toBeCloseTo(gain, 10);
	});

	it('restores the original score when reselecting the equipped core', () => {
		const s = structuredClone(base);
		edited(s).grade = 'relic';
		edited(s).variant = 0;
		edited(s).grade = undefined;
		edited(s).variant = undefined;
		expect(simulate(l, s, base)).toEqual(before);
	});

	it('applies a Weapon grade downgrade through base stats', () => {
		const s = structuredClone(base);
		edited(s).grade = 'relic';
		const after = simulate(l, s, base);
		expect(after.weaponPower).toBeCloseTo((276155 / 1.12 - 5200 + 3900) * 1.1125, 8);
		expect(after.cp).toBeLessThan(before.cp);
		expect(after.parts.find((p) => p.id === c.id)?.value).toBe(0);
	});
});
