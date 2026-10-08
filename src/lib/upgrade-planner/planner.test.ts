import { describe, expect, it } from 'vitest';
import { PartType, baseAttackPoint, combatPower, partHigh } from './cp';
import soulshan from './fixtures/na-soulshan.json';
import {
	ACCESSORY_LINES,
	GEM_T4,
	astrogemOptionValue,
	coreValue,
	decodeCore,
	engravingTable
} from './tables';
import type { Loadout } from './types';
import { astrogemTotals, buildUpgrades, coreStates, evaluateAstrogemSwap, weaponPowerOf } from './upgrades';

const loadout = soulshan as unknown as Loadout;
const parts = loadout.battlePoint.parts;
const ofType = (t: number) => parts.filter((p) => p.type === t);

describe('combat power', () => {
	it('reproduces the in-game score from battle point parts', () => {
		const cp = combatPower(parts);
		expect(cp.max).toBeCloseTo(loadout.combatPower!.score, 2);
		expect(cp.min).toBeLessThan(cp.max); // pet specialty is a range
	});

	it('reproduces the base attack battle point from main stat and weapon power', () => {
		const base = parts.find((p) => p.type === PartType.BaseAttack)! as Record<string, number>;
		expect(baseAttackPoint(base.mainStat, base.weaponPower, base.attackPowerMultiplier)).toBeCloseTo(base.value, 4);
	});
});

describe('tables reproduce bible values', () => {
	it('gems', () => {
		for (const p of ofType(PartType.Gem)) {
			const level = Math.floor((p.id as number) / 10) % 100;
			expect(GEM_T4[level - 1]).toBe(partHigh(p));
		}
	});

	it('ark grid cores', () => {
		const states = coreStates(loadout);
		expect(states).toHaveLength(6);
		for (const s of states) expect(s.modelValue).toBe(s.value);
	});

	it('core ids decode to the expected shape and grade', () => {
		expect(decodeCore(673004436)).toMatchObject({ attr: 'order', shape: 'sun', grade: 'ancient' });
		expect(decodeCore(673111006)).toMatchObject({ attr: 'chaos', shape: 'moon', grade: 'ancient', tier: 1 });
		expect(decodeCore(673120005)).toMatchObject({ attr: 'chaos', shape: 'star', grade: 'relic', tier: 0 });
		expect(decodeCore(673121006)).toMatchObject({ weaponCore: true });
	});

	it('core curve follows the published breakpoints', () => {
		const sun = decodeCore(673004436)!;
		expect([9, 10, 14, 16, 17, 20].map((p) => coreValue(sun, p, 250000))).toEqual([0, 150, 400, 400, 850, 900]);
	});

	it('astrogem options', () => {
		for (const p of ofType(PartType.ArkGridGem))
			expect(astrogemOptionValue(p.id as number, p.totalLevel as number)).toBe(partHigh(p));
	});

	it('engravings', () => {
		for (const p of ofType(PartType.Engraving)) {
			const table = engravingTable(p.id as number)!;
			expect(table, `engraving ${p.id}`).toBeDefined();
			expect(table[p.stonePoints as number]).toContain(partHigh(p));
		}
	});

	it('accessory lines', () => {
		for (const p of ofType(PartType.AccessoryGrinding)) {
			const stat = p.stat as { type: number; index: number; value: number };
			const line = ACCESSORY_LINES.find((l) => l.match(stat));
			if (!line?.toBattlePoints) continue; // weapon power % moves base attack instead
			expect(line.toBattlePoints(stat.value)).toBeCloseTo(partHigh(p), 2);
		}
	});
});

describe('upgrades', () => {
	const upgrades = buildUpgrades(loadout);
	const find = (key: string) => upgrades.find((u) => u.key === key);

	it('is sorted best first and only lists gains', () => {
		expect(upgrades.length).toBeGreaterThan(10);
		for (let i = 1; i < upgrades.length; i++) expect(upgrades[i - 1].gainPct).toBeGreaterThanOrEqual(upgrades[i].gainPct);
		expect(upgrades.every((u) => u.gainPct > 0)).toBe(true);
	});

	it('groups identical gems and prices Lv. 9 → 10 at 704/640', () => {
		const g = find('gem:T4:9')!;
		expect(g.count).toBe(10);
		expect(g.gainPct).toBeCloseTo((10704 / 10640 - 1) * 100, 6);
	});

	it('prices the next core breakpoint', () => {
		const sun = find('core:673004436:18')!; // ancient order sun 17P → 18P: 850 → 867
		expect(sun.gainPct).toBeCloseTo((10867 / 10850 - 1) * 100, 6);
	});

	it('leaves ability stones out (not a practical upgrade)', () => {
		expect(upgrades.some((u) => u.key.startsWith('stone:'))).toBe(false);
	});

	it('skips relic book steps when already at 20 books', () => {
		expect(upgrades.some((u) => u.key.startsWith('engraving:') && u.key.includes(':books:'))).toBe(false);
	});

	it('values a ring Crit Rate mid → high', () => {
		const u = find('accessory:finger1:crit_rate')!;
		expect(u.gainPct).toBeCloseTo(((1e4 + 155 * 0.7742) / (1e4 + 95 * 0.7742) - 1) * 100, 6);
	});

	it('copes with a sparse loadout (no ark grid, gems, items or engravings)', () => {
		const base = parts.find((p) => p.type === PartType.BaseAttack)!;
		const sparse = { type: 'ark_passive', classId: 'x', itemLevel: 1700, battlePoint: { isSupport: false, parts: [base] } } as Loadout;
		expect(buildUpgrades(sparse)).toEqual([]);
		expect(coreStates(sparse)).toEqual([]);
	});

});

describe('astrogem swap', () => {
	it('is zero when swapping a gem for an identical one', () => {
		const core = loadout.arkGridCores![0];
		const gem = core.gems[0];
		const r = evaluateAstrogemSwap(loadout, 0, gem.idx, { corePoints: gem.corePoints, opts: gem.opts })!;
		expect(r.gainPct).toBeCloseTo(0, 10);
	});

	it('adds core breakpoint and option gains', () => {
		const core = loadout.arkGridCores![0]; // ancient order sun at 17P
		const gem = core.gems.find((g) => g.corePoints === 4)!;
		const t = astrogemTotals(loadout);
		const r = evaluateAstrogemSwap(loadout, 0, gem.idx, { corePoints: 5, opts: gem.opts })!;
		expect(r.pointsAfter).toBe(18);
		expect(r.optionGainPct).toBeCloseTo(0, 10);
		expect(r.coreGainPct).toBeCloseTo((10867 / 10850 - 1) * 100, 6);
		expect(t.levels[2003]).toBe(49);
		expect(weaponPowerOf(loadout)).toBeGreaterThan(0);
	});
});
