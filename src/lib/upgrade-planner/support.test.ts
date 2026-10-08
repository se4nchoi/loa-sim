import { describe, expect, it } from 'vitest';
import { PartType, partHigh } from './cp';
import brushann from './fixtures/na-brushann.json';
import {
	SUPPORT_ACCESSORY_LINES,
	SUPPORT_GEM_T4,
	coreOptionName,
	supportAstrogemValue,
	supportCombatPower,
	supportCoreValue,
	supportEngravingTable,
	swappedCoreId
} from './support';
import type { Loadout } from './types';

const l = brushann as unknown as Loadout;
const parts = l.battlePoint.parts;
const ofType = (t: number) => parts.filter((p) => p.type === t);

describe('support tables reproduce bible (Brushann, Artist)', () => {
	it('splits the score into Buff and Shield & Heal Power like bible', () => {
		const cp = supportCombatPower(parts);
		expect(cp.buff).toBeCloseTo(2713.82, 2);
		expect(cp.shieldHeal).toBeCloseTo(703.48, 2);
		// The game's own score is a few percent below this sum; the simulator anchors on it.
		expect(Math.abs(cp.total / l.combatPower!.score - 1)).toBeLessThan(0.04);
	});

	it('gems', () => {
		for (const p of ofType(PartType.Gem)) expect(SUPPORT_GEM_T4).toContain(partHigh(p));
	});

	it('engravings (Buff and Shield & Heal)', () => {
		for (const p of [...ofType(PartType.Engraving), ...ofType(PartType.EngravingDefense)]) {
			const t = supportEngravingTable(p.id as number);
			expect(t, `engraving ${p.id}`).toBeDefined();
			expect(t!.defense).toBe(p.type === PartType.EngravingDefense);
			expect(t!.table[p.stonePoints as number]).toContain(partHigh(p));
		}
	});

	it('ark grid cores and astrogem options', () => {
		for (const p of ofType(PartType.ArkGridCore)) expect(supportCoreValue(p.id as number, p.points as number).value).toBe(partHigh(p));
		for (const p of ofType(PartType.ArkGridGem)) expect(supportAstrogemValue(p.id as number, p.totalLevel as number)).toBe(partHigh(p));
	});

	it('accessory lines', () => {
		for (const p of [...ofType(PartType.AccessoryGrinding), ...ofType(PartType.AccessoryGrindingDefense)]) {
			const stat = p.stat as { type: number; index: number; value: number };
			const line = SUPPORT_ACCESSORY_LINES.find((x) => x.match(stat));
			if (!line?.toBattlePoints) continue;
			expect(!!line.defense).toBe(p.type === PartType.AccessoryGrindingDefense);
			expect(line.toBattlePoints(stat.value)).toBeCloseTo(partHigh(p), 2);
		}
	});

	it('names and swaps cores', () => {
		expect(coreOptionName(673113005)).toBe('Echoing Brand');
		expect(coreOptionName(swappedCoreId(673113005, 'ancient', 4))).toBe('Echoing Steel');
		expect(swappedCoreId(673014515, 'ancient')).toBe(673014516);
	});
});
