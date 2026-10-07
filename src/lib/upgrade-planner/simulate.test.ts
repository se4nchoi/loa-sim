import { describe, expect, it } from 'vitest';
import { PartType } from './cp';
import soulshan from './fixtures/na-soulshan.json';
import { HONING_TABLE } from './honing-data';
import { gemDpsGainPct } from './dps';
import { gemParts, initSimState, itemLevel, mainStatIndex, optionLevel, simCorePoints, simulate, type SimState } from './simulate';
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
			{ key: 'other', label: 'Brand Power +2.15%' }
		]);
		expect(s.accessories.finger2![1]).toEqual({ key: 'other', label: 'Ally Atk. Power Enhancement Effect +1.35%' });
		expect(s.accessories.ear2).toEqual([
			{ key: 'atk_pct', tier: 'mid' },
			{ key: 'weapon_pct', tier: 'high' },
			{ key: 'atk_flat', tier: 'low' }
		]);
	});

	it('reads gems, engravings, astrogems and karma', () => {
		expect(s.gems.map((g) => g.level)).toEqual([9, 9, 9, 9, 9, 10, 9, 9, 9, 9, 9]);
		expect(s.gems[0]).toEqual({ level: 9, kind: 'damage', skill: 46500 }); // Reaper's Scythe
		expect(s.gems[4]).toEqual({ level: 9, kind: 'cooldown', skill: 46430 }); // Astaros
		expect(s.engravings[1254]).toEqual({ books: 4, stone: 3 });
		expect(s.arkGrid).toHaveLength(6);
		expect(s.arkGrid[0].gems).toHaveLength(4);
		expect(simCorePoints(loadout, s, s, 673004436)).toBe(17);
		expect(optionLevel(s.arkGrid, 2003)).toBe(49);
		expect(s.karma).toEqual({ evolution: 6, leap: 28 });
	});

	it('reads accessory main stat and the bracelet', () => {
		expect(mainStatIndex(loadout)).toBe(4); // Dexterity
		expect(s.accessoryStats).toEqual({ neck: 17670, ear1: 13556, ear2: 13723, finger1: 12220, finger2: 12452 });
		expect(s.bracelet).toEqual({
			stats: [
				{ index: 15, value: 86 },
				{ index: 16, value: 77 }
			],
			effects: ['4:605100173', '3:11043', '3:11051']
		});
	});
});

describe('gem DPS estimate', () => {
	const parts = gemParts(loadout);

	it('is null until a damage share is entered', () => {
		expect(gemDpsGainPct(fresh().gems, fresh().gems, parts, {})).toBeNull();
	});

	it('scales a damage gem by its skill share', () => {
		const before = fresh().gems;
		const after = structuredClone(before);
		after[0].level = 10; // Reaper's Scythe damage 40% → 44%
		const gain = gemDpsGainPct(before, after, parts, { 46500: 25 })!;
		expect(gain).toBeCloseTo(25 * (1.44 / 1.4 - 1), 9);
		// The same upgrade on a skill doing 2% of the damage is worth 1/12.5 as much.
		expect(gemDpsGainPct(before, after, parts, { 46500: 2 })!).toBeCloseTo(gain / 12.5, 9);
	});

	it('treats cooldown gems as more casts', () => {
		const before = fresh().gems;
		const after = structuredClone(before);
		after[4].level = 10; // Astaros cooldown 22% → 24%; Astaros also has a Lv. 10 damage gem
		expect(gemDpsGainPct(before, after, parts, { 46430: 20 })!).toBeCloseTo(20 * (0.78 / 0.76 - 1), 9);
	});

	it('moving a gem to another skill shifts the gain to that skill', () => {
		const before = fresh().gems;
		const after = structuredClone(before);
		after[0].skill = 46450; // Reaper's Scythe's damage gem moved to Death Yard
		const gain = gemDpsGainPct(before, after, parts, { 46500: 20, 46450: 2 })!;
		expect(gain).toBeCloseTo(20 * (1 / 1.4 - 1) + 2 * (1.4 - 1), 9);
	});
});

describe('simulate', () => {
	it('reproduces the current CP exactly when nothing is edited', () => {
		expect(CP).toBeCloseTo(loadout.combatPower!.score, 2);
	});

	it('one gem Lv. 9 → 10', () => {
		expect(pct(edit((s) => (s.gems[0].level = 10)))).toBeCloseTo((10704 / 10640 - 1) * 100, 6);
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

	it('astrogem core points move the core along its curve', () => {
		// Ancient order sun at 17P; three gems +1 point each → 20P: 850 → 900
		const cp = edit((s) => s.arkGrid[0].gems.slice(0, 3).forEach((g) => (g.corePoints += 1)));
		expect(pct(cp)).toBeCloseTo((10900 / 10850 - 1) * 100, 6);
	});

	it('astrogem option levels add up across gems', () => {
		// First gem's Boss Damage Lv. 5 → swap its Atk. Power Lv. 3 for Boss Damage Lv. 5: Boss 49 → 54, Atk 46 → 43
		const cp = edit((s) => (s.arkGrid[0].gems[0].opts = [{ id: 2003, level: 5 }, { id: 2003, level: 5 }]));
		const boss = (10000 + Math.floor((54 * 1000) / 120)) / (10000 + 408);
		const atk = (10000 + Math.floor((43 * 400) / 120)) / (10000 + 153);
		expect(cp / CP).toBeCloseTo(boss * atk, 9);
	});

	it('accessory main stat changes base attack', () => {
		const s = fresh();
		s.accessoryStats.neck! += 1000;
		const r = simulate(loadout, s);
		const base = loadout.battlePoint.parts.find((p) => p.type === PartType.BaseAttack)! as Record<string, number>;
		expect(r.mainStat - base.mainStat).toBe(1000);
		expect(pct(r.cp)).toBeCloseTo((Math.sqrt((base.mainStat + 1000) / base.mainStat) - 1) * 100, 6);
	});

	it('bracelet effects use the game catalog values', () => {
		// Non-directional 2.5% (250) → 3.5% (350)
		const cp = edit((s) => (s.bracelet!.effects[0] = '4:605100171'));
		expect(pct(cp)).toBeCloseTo((10350 / 10250 - 1) * 100, 6);
	});

	it('bracelet combat stats feed part 26 at 3 per point', () => {
		// Crit +86 → +100: combat stats 7653 → 7695
		const cp = edit((s) => (s.bracelet!.stats[0].value = 100));
		expect(pct(cp)).toBeCloseTo(((10000 + 7653 + 14 * 3) / (10000 + 7653) - 1) * 100, 6);
	});

	it('karma', () => {
		expect(pct(edit((s) => (s.karma.leap = 30)))).toBeCloseTo((10060 / 10056 - 1) * 100, 6);
	});

	it('combines edits multiplicatively', () => {
		const both = edit((s) => {
			s.gems[0].level = 10;
			s.karma.leap = 30;
		});
		expect(both / CP).toBeCloseTo((10704 / 10640) * (10060 / 10056), 9);
	});
});
