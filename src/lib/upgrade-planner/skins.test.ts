import { describe, expect, it } from 'vitest';
import soulshan from './fixtures/na-soulshan.json';
import brushann from './fixtures/na-brushann.json';
import drkuuljulian from './fixtures/ce-drkuuljulian.json';
import yktra from './fixtures/ce-yktra.json';
import { PartType } from './cp';
import { initSimState, simulate } from './simulate';
import { readSkinBonus, setSkinPart, skinParts, skinStatRatio, type SimSkins } from './skins';
import type { Loadout } from './types';

describe('importing skin bonuses', () => {
	it('reads Epic and Legendary totals without cosmetic item metadata', () => {
		expect(readSkinBonus(brushann as unknown as Loadout, 5)).toBe(4);
		expect(readSkinBonus(drkuuljulian as unknown as Loadout, 4)).toBe(8);
	});
	it('detects Legendary stats underneath appearance overrides and excludes shared cosmetic bonuses', () => {
		expect(readSkinBonus(yktra as unknown as Loadout, 5)).toBe(8); // 109% Int vs 101% Str/Dex
	});
	it('leaves old snapshots unknown instead of assuming no skins', () => {
		expect(initSimState(soulshan as unknown as Loadout).skins.bonus).toBeNull();
	});
	it('does not infer a skin total from incomplete or inconsistent multipliers', () => {
		const l = structuredClone(brushann) as unknown as Loadout;
		l.stats = [{ type: 7, value: 10100 }, { type: 8, value: 10200 }, { type: 9, value: 10500 }];
		expect(readSkinBonus(l, 5)).toBeNull();
		l.stats = [{ type: 9, value: 10500 }];
		expect(readSkinBonus(l, 5)).toBeNull();
	});
});

describe('skin simulation', () => {
	it('keeps an imported mixed total until all individual grades are supplied', () => {
		let skins: SimSkins = { bonus: 4, currentBonus: null };
		expect(skinParts(skins)).toEqual([null, null, null, null]);
		skins = setSkinPart(skins, 0, 2);
		expect(skins.bonus).toBe(4);
		skins = setSkinPart(skins, 1, 1);
		skins = setSkinPart(skins, 2, 0.5);
		skins = setSkinPart(skins, 3, 0);
		expect(skins.bonus).toBe(3.5);
	});
	it('changes one Legendary piece to Epic without changing the other pieces', () => {
		const original = { bonus: 8, currentBonus: null };
		const skins = setSkinPart(original, 1, 1);
		expect(skinParts(skins)).toEqual([2, 1, 2, 2]);
		expect(skins.bonus).toBe(7);
		expect(original.bonus).toBe(8);
		expect(skinStatRatio(skins, original, 10800)).toBeCloseTo(10700 / 10800, 12);
	});
	it('does not double count already-Legendary skins', () => {
		const l = drkuuljulian as unknown as Loadout;
		const base = initSimState(l);
		const s = structuredClone(base);
		s.skins.bonus = 8;
		expect(simulate(l, s, base).cp).toBe(simulate(l, base, base).cp);
	});
	it('scales main stat using the imported multiplier while leaving support HP unchanged', () => {
		const l = brushann as unknown as Loadout;
		const base = initSimState(l);
		const before = simulate(l, base, base);
		const s = structuredClone(base);
		s.skins.bonus = 8;
		const after = simulate(l, s, base);
		expect(after.mainStat / before.mainStat).toBeCloseTo(10900 / 10500, 12);
		expect(after.parts.find((p) => p.type === PartType.BaseHealth)).toEqual(before.parts.find((p) => p.type === PartType.BaseHealth));
		expect(after.cp).toBeGreaterThan(before.cp);
	});
	it('requires a supplied current bonus when the snapshot has no multipliers', () => {
		const l = soulshan as unknown as Loadout;
		const base = initSimState(l);
		const s = structuredClone(base);
		const before = simulate(l, base, base);
		s.skins.bonus = 8;
		expect(simulate(l, s, base).cp).toBe(before.cp);
		s.skins.currentBonus = 4;
		expect(simulate(l, s, base).cp / before.cp).toBeCloseTo(Math.sqrt(108 / 104), 10);
	});
	it('applies the skin multiplier to other main-stat edits and restores the baseline when reset', () => {
		const l = brushann as unknown as Loadout;
		const base = initSimState(l);
		const s = structuredClone(base);
		s.gear.head!.honing++;
		s.bracer = { grade: 'ancient', honing: 25 };
		const gearOnly = simulate(l, s, base);
		s.skins.bonus = 8;
		expect(simulate(l, s, base).mainStat / gearOnly.mainStat).toBeCloseTo(10900 / 10500, 12);
		s.skins = { ...base.skins };
		expect(simulate(l, s, base).cp).toBe(gearOnly.cp);
	});
	it('supports removing skins and Rare half-percent totals', () => {
		expect(skinStatRatio({ bonus: 0, currentBonus: null }, { bonus: 8, currentBonus: null }, 10900)).toBeCloseTo(10100 / 10900, 12);
		expect(skinStatRatio({ bonus: 4.5, currentBonus: 4 }, { bonus: null, currentBonus: null })).toBeCloseTo(10450 / 10400, 12);
	});
});
