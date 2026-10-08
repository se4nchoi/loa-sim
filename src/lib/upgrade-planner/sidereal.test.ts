import { describe, expect, it } from 'vitest';
import mira from './fixtures/na-mira.json';
import soulshan from './fixtures/na-soulshan.json';
import { initSimState, itemLevel, simulate } from './simulate';
import { readSidereal, setSiderealInfusion, siderealBattlePoints, siderealItemLevel, siderealMaxEvolution, siderealWeaponPower } from './sidereal';
import { PartType, combatPower } from './cp';
import { coreStates, coreValueAs, weaponPowerOf } from './upgrades';
import { coreValue, decodeCore } from './tables';
import type { Loadout } from './types';

const loadout = mira as unknown as Loadout;
const roleScore = (parts: Parameters<typeof combatPower>[0]) => combatPower(parts).max;

describe('Sidereal owner import and progression', () => {
	it('imports Mira’s real +8 Elgic III without adding advanced honing twice', () => {
		const base = initSimState(loadout);
		expect(base.sidereal).toMatchObject({ evolution: 8, infusion: 3, advanced: 40 });
		expect(base.gear.weapon).toBeUndefined();
		expect(siderealItemLevel(base.sidereal!)).toBe(1775);
		expect(siderealWeaponPower(base.sidereal!)).toBe(214400);
		expect(itemLevel(base)).toBeCloseTo(loadout.itemLevel, 3);
		expect(simulate(loadout, structuredClone(base), base).weaponPower).toBe(236835);
		expect(readSidereal(soulshan as unknown as Loadout)).toBeNull();
	});

	it('evolving +8 → +9 → +10 raises Weapon Power and CP, then resets exactly', () => {
		const base = initSimState(loadout);
		const state = structuredClone(base);
		const before = simulate(loadout, base, base);
		state.sidereal!.evolution = 9;
		const nine = simulate(loadout, state, base);
		state.sidereal!.evolution = 10;
		const ten = simulate(loadout, state, base);
		expect(nine.weaponPower / before.weaponPower).toBeCloseTo(242574 / 214400, 9);
		expect(ten.weaponPower / before.weaponPower).toBeCloseTo(259554 / 214400, 9);
		expect(ten.cp).toBeGreaterThan(nine.cp);
		expect(nine.cp).toBeGreaterThan(before.cp);
		state.sidereal = structuredClone(base.sidereal);
		expect(simulate(loadout, state, base)).toEqual(before);
	});

	it('uses item IDs for infusion and bounds evolution and advanced honing when switching', () => {
		const l = structuredClone(loadout);
		const weapon = l.items!.find((i) => i.slot === 'weapon')!;
		weapon.id = 113513560;
		const s = readSidereal(l)!;
		expect(s.infusion).toBe(2);
		expect(siderealItemLevel(s)).toBe(1755);
		expect(siderealMaxEvolution(2)).toBe(9);
		setSiderealInfusion(s, 3);
		expect(s.advanced).toBe(40);
		s.evolution = 10;
		setSiderealInfusion(s, 1);
		expect(s).toMatchObject({ evolution: 8, advanced: 20 });
		expect(siderealMaxEvolution(3)).toBe(10);
	});
});

describe('weapon core grade regression', () => {
	it('retains the imported correction when relic Weapon becomes ancient', () => {
		const l = structuredClone(loadout);
		const id = 673121005;
		const core = l.arkGridCores!.find((c) => String(c.id).startsWith('67312'))!;
		const part = l.battlePoint.parts.find((p) => p.type === PartType.ArkGridCore && p.id === core.id)!;
		core.id = id;
		part.id = id;
		part.value = 650; // Higher than our approximation: this previously produced a downgrade.
		const c = coreStates(l).find((c) => c.id === id)!;
		const ancient = decodeCore(673121006)!;
		const wp = weaponPowerOf(l);
		const expected = 650 + coreValue(ancient, c.points, wp) - c.modelValue;
		expect(coreValueAs(c, ancient, c.points, wp)).toBe(expected);
		expect(expected).toBeGreaterThan(650);
		const base = initSimState(l);
		const s = structuredClone(base);
		s.arkGrid.find((c) => c.id === id)!.grade = 'ancient';
		expect(simulate(l, s, base).cp).toBeGreaterThan(simulate(l, base, base).cp);
	});
});

describe('Sidereal battle points (part 23)', () => {
	const base = initSimState(loadout);
	const part = (s: typeof base) => simulate(loadout, s, base).parts.find((p) => p.type === PartType.EstherWeapon)?.value;

	it('reproduces bible: Elgic III +8 = 190', () => {
		expect(siderealBattlePoints(base.sidereal!)).toBe(190);
		expect(part(base)).toBe(190);
	});

	it('follows Elgic level and evolution steps (+6 / +8, held above)', () => {
		const s = structuredClone(base);
		setSiderealInfusion(s.sidereal!, 2); // Elgic II +8
		expect(s.sidereal!.evolution).toBe(8);
		expect(part(s)).toBe(143);
		s.sidereal!.evolution = 9;
		expect(part(s)).toBe(143);
		s.sidereal!.evolution = 7;
		expect(part(s)).toBe(75);
		setSiderealInfusion(s.sidereal!, 0);
		s.sidereal!.evolution = 5;
		expect(part(s)).toBe(0);
	});

	it('changing it moves CP by the part ratio, on top of Weapon Power', () => {
		const s = structuredClone(base);
		s.sidereal!.evolution = 7; // below the +8 step: 190 → 100
		const withBp = simulate(loadout, s, base).cp;
		const parts = simulate(loadout, s, base).parts.map((p) => (p.type === PartType.EstherWeapon ? { ...p, value: 190 } : p));
		const withoutBpChange = roleScore(parts);
		expect(withBp / withoutBpChange).toBeCloseTo((1e4 + 100) / (1e4 + 190), 9);
	});
});

