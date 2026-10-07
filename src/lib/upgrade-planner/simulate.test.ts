import { describe, expect, it } from 'vitest';
import { PartType } from './cp';
import soulshan from './fixtures/na-soulshan.json';
import { HONING_TABLE } from './honing-data';
import { initSimState, itemLevel, simulate, type SimState } from './simulate';
import type { Loadout } from './types';

const loadout = soulshan as unknown as Loadout;
const fresh = () => initSimState(loadout);
/** Unrounded baseline (bible shows 6785.48). */
const CP = simulate(loadout, fresh()).cp;
const edit = (fn: (s: SimState) => void) => {
	const s = fresh();
	fn(s);
	return simulate(loadout, s).cp;
};
const pct = (cp: number) => (cp / CP - 1) * 100;

describe('initSimState', () => {
	const s = fresh();

	it('reads gear honing and advanced honing', () => {
		expect(s.gear.head).toEqual({ honing: 21, advanced: 40 });
		expect(s.gear.hand).toEqual({ honing: 22, advanced: 40 });
		expect(s.gear.weapon).toEqual({ honing: 24, advanced: 40 });
		expect(itemLevel(s)).toBeCloseTo(1784.1667, 3);
	});

	it('reads accessory lines with tiers', () => {
		expect(s.accessories.neck).toEqual([
			{ key: 'add_dmg', tier: 'high' },
			{ key: 'outgoing_dmg', tier: 'mid' },
			{ key: 'other', label: 'Other (no DPS value)' }
		]);
		expect(s.accessories.ear2).toEqual([
			{ key: 'atk_pct', tier: 'mid' },
			{ key: 'weapon_pct', tier: 'high' },
			{ key: 'atk_flat', tier: 'low' }
		]);
	});

	it('reads gems, engravings, cores, astrogems and karma', () => {
		expect(s.gems).toEqual([9, 9, 9, 9, 9, 10, 9, 9, 9, 9, 9]);
		expect(s.engravings[1254]).toEqual({ books: 4, stone: 3 });
		expect(s.cores[673004436]).toBe(17);
		expect(s.astrogems[2003]).toBe(49);
		expect(s.karma).toEqual({ evolution: 6, leap: 28 });
	});
});

describe('simulate', () => {
	it('reproduces the current CP exactly when nothing is edited', () => {
		expect(CP).toBeCloseTo(loadout.combatPower!.score, 2);
	});

	it('one gem Lv. 9 → 10', () => {
		expect(pct(edit((s) => (s.gems[0] = 10)))).toBeCloseTo((10704 / 10640 - 1) * 100, 6);
	});

	it('necklace Outgoing Damage mid → high', () => {
		const cp = edit((s) => (s.accessories.neck![1] = { key: 'outgoing_dmg', tier: 'high' }));
		expect(pct(cp)).toBeCloseTo((10200 / 10120 - 1) * 100, 6);
	});

	it('swapping a non-DPS ring line for Crit Damage high', () => {
		const cp = edit((s) => (s.accessories.finger2![1] = { key: 'crit_dmg', tier: 'high' }));
		expect(pct(cp)).toBeCloseTo((10120 / 1e4 - 1) * 100, 6);
	});

	it('armor honing +21 → +22 raises main stat by the table step × 1.02', () => {
		const s = fresh();
		s.gear.head!.honing = 22;
		const r = simulate(loadout, s);
		const step = (HONING_TABLE.head.honing[22] - HONING_TABLE.head.honing[21]) * 1.02;
		const base = loadout.battlePoint.parts.find((p) => p.type === PartType.BaseAttack)! as Record<string, number>;
		expect(r.mainStat - base.mainStat).toBeCloseTo(step, 6);
		expect(pct(r.cp)).toBeCloseTo((Math.sqrt((base.mainStat + step) / base.mainStat) - 1) * 100, 6);
		expect(itemLevel(s)).toBeCloseTo(1785, 3);
	});

	it('weapon honing scales Weapon Power by the table ratio', () => {
		const s = fresh();
		s.gear.weapon!.honing = 25;
		const r = simulate(loadout, s);
		const t = HONING_TABLE.weapon;
		const ratio = (t.honing[25] + t.advanced[40]) / (t.honing[24] + t.advanced[40]);
		expect(pct(r.cp)).toBeCloseTo((Math.sqrt(ratio) - 1) * 100, 6);
	});

	it('engraving stone and relic books', () => {
		// Grudge Lv. 0 → 4 stone at 20 books: 21% → 27%
		expect(pct(edit((s) => (s.engravings[1118].stone = 4)))).toBeCloseTo((12700 / 12100 - 1) * 100, 6);
	});

	it('core points use the anchored curve', () => {
		expect(pct(edit((s) => (s.cores[673004436] = 20)))).toBeCloseTo((10900 / 10850 - 1) * 100, 6);
	});

	it('astrogem option levels', () => {
		// Boss Damage 49 → 59: floor(59×1000/120) = 491 vs 408
		expect(pct(edit((s) => (s.astrogems[2003] = 59)))).toBeCloseTo((10491 / 10408 - 1) * 100, 6);
	});

	it('karma', () => {
		expect(pct(edit((s) => (s.karma.leap = 30)))).toBeCloseTo((10060 / 10056 - 1) * 100, 6);
	});

	it('combines edits multiplicatively', () => {
		const both = edit((s) => {
			s.gems[0] = 10;
			s.karma.leap = 30;
		});
		expect(both / CP).toBeCloseTo((10704 / 10640) * (10060 / 10056), 9);
	});
});
