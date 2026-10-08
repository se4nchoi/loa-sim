import { describe, expect, it } from 'vitest';
import { PartType } from './cp';
import soulshan from './fixtures/na-soulshan.json';
import { HONING_TABLE } from './honing-data';
import { gemDpsGainPct } from './dps';
import { gemParts, initSimState, itemLevel, mainStatIndex, optionLevel, simCoreInfo, simCorePoints, simulate, type SimState } from './simulate';
import { className } from './class-names';
import { coreValue } from './tables';
import { coreStates, weaponPowerOf } from './upgrades';
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
		expect(s.karma).toEqual({ evolution: 23, enlightenment: 29, leap: 28 });
	});

	it('reads accessory main stat and the bracelet', () => {
		expect(mainStatIndex(loadout)).toBe(4); // Dexterity
		expect(s.accessoryStats).toEqual({ neck: 17670, ear1: 13556, ear2: 13723, finger1: 12220, finger2: 12452 });
		expect(s.bracelet).toEqual({
			lines: [
				{ kind: 'stat', index: 15, value: 86 },
				{ kind: 'stat', index: 16, value: 77 },
				{ kind: 'effect', key: '4:605100173' },
				{ kind: 'effect', key: '3:11043' },
				{ kind: 'effect', key: '3:11051' }
			]
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

	it('swapping an engraving scores it with the new engraving table', () => {
		// Cursed Doll (stone Lv. 2, 20 books: 20.75%) → Grudge at the same stone/books: 24.75%
		expect(pct(edit((s) => (s.engravings[1247].as = 1118)))).toBeCloseTo((12475 / 12075 - 1) * 100, 6);
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
		const cp = edit((s) => (s.bracelet!.lines[2] = { kind: 'effect', key: '4:605100171' }));
		expect(pct(cp)).toBeCloseTo((10350 / 10250 - 1) * 100, 6);
	});

	it('bracelet combat stats feed part 26 at 3 per point', () => {
		// Crit +86 → +100: combat stats 7653 → 7695
		const cp = edit((s) => (s.bracelet!.lines[0] = { kind: 'stat', index: 15, value: 100 }));
		expect(pct(cp)).toBeCloseTo(((10000 + 7653 + 14 * 3) / (10000 + 7653) - 1) * 100, 6);
	});

	it('evolution karma scores by rank: Lv. 23 (rank 6) → Lv. 20 (rank 5) loses 60', () => {
		expect(pct(edit((s) => (s.karma.evolution = 20)))).toBeCloseTo((10300 / 10360 - 1) * 100, 6);
		expect(pct(edit((s) => (s.karma.evolution = 25)))).toBeCloseTo(0, 9); // still rank 6
	});

	it('enlightenment karma adds 0.1% Weapon Power per level', () => {
		const s = fresh();
		s.karma.enlightenment = 30; // 29 → 30
		const r = simulate(loadout, s);
		const base = loadout.battlePoint.parts.find((p) => p.type === PartType.BaseAttack)! as Record<string, number>;
		// Weapon % before: earrings 1.8 + 3.0 + karma 2.9 = 7.7; after 7.8.
		expect(r.weaponPower / base.weaponPower).toBeCloseTo(107.8 / 107.7, 9);
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

describe('core type swap', () => {
	const l = soulshan as unknown as Loadout;
	const base = initSimState(l);
	const cpOf = (mutate: (s: SimState) => void) => {
		const s = structuredClone(base);
		mutate(s);
		return simulate(l, s, base).cp;
	};
	const core = (id: number) => coreStates(l).find((c) => c.id === id)!;
	const ratio = (from: number, to: number) => (1e4 + to) / (1e4 + from);

	it('chaos second option → top option (Absorbing → Smoldering) adds the curve difference', () => {
		const c = core(673111006);
		expect(c.info.tier).toBe(1);
		const after = cpOf((s) => (s.arkGrid.find((x) => x.id === c.id)!.variant = 0));
		const to = coreValue({ ...c.info, tier: 0 }, c.points, weaponPowerOf(l));
		expect(after / simulate(l, base, base).cp).toBeCloseTo(ratio(c.value, to), 10);
	});

	it('relic → ancient adds the ancient bonus from 17P', () => {
		const c = core(673014435);
		expect(c.info.grade).toBe('relic');
		const after = cpOf((s) => (s.arkGrid.find((x) => x.id === c.id)!.grade = 'ancient'));
		const to = coreValue({ ...c.info, grade: 'ancient' }, c.points, weaponPowerOf(l));
		expect(to - coreValue(c.info, c.points, weaponPowerOf(l))).toBe(c.points >= 17 ? 100 : 0);
		expect(after / simulate(l, base, base).cp).toBeCloseTo(ratio(c.value, to), 10);
	});

	it('picking the equipped type again changes nothing', () => {
		const c = core(673120005);
		expect(simCoreInfo(c.info, { id: c.id, gems: [], grade: c.info.grade, variant: 0 })).toBe(c.info);
		expect(simCoreInfo(c.info, { id: c.id, gems: [], variant: 1 }).weaponCore).toBe(true);
		// Absorbing → Crushing: same second-tier curve, so nothing changes.
		const moon = core(673111006);
		expect(simCoreInfo(moon.info, { id: moon.id, gems: [], variant: 2 })).toBe(moon.info);
	});
});

describe('gems on skill groups', () => {
	it('reads brilliant gems naming skill groups (types 34/35) and merges damage/cooldown group ids', () => {
		const l = structuredClone(soulshan) as unknown as Loadout;
		// Guardian Knight style: Rending Finisher damage on group 170008, cooldown on 170009.
		l.gems![0].effects = [{ type: 34, id: 170008, value: 3600 }];
		l.gems![1].effects = [{ type: 35, id: 170009, value: 2000 }];
		const [a, b] = initSimState(l).gems;
		expect(a).toMatchObject({ kind: 'damage', skill: 170008 });
		expect(b).toMatchObject({ kind: 'cooldown', skill: 170008 });
	});
});

describe('class names', () => {
	it('uses NA names', () => {
		expect(className('soul_eater')).toBe('Souleater');
		expect(className('dimension_master')).toBe('Dimensionalist');
		expect(className('dragon_knight')).toBe('Guardianknight');
		expect(className('infighter_male')).toBe('Breaker');
		expect(className('new_class')).toBe('New Class');
	});
});

describe('bracelet main stat', () => {
	it('pads to five lines', () => {
		const l = structuredClone(soulshan) as unknown as Loadout;
		const br = l.items!.find((i) => i.slot === 'bracelet')!;
		br.data.stats = br.data.stats!.slice(0, 4);
		expect(initSimState(l).bracelet!.lines.map((x) => x.kind)).toEqual(['stat', 'stat', 'effect', 'effect', 'empty']);
	});

	it('reads % lines in 1/100 % (Crit Rate +5% = 500 → 350 battle points)', () => {
		const l = soulshan as unknown as Loadout;
		const base = initSimState(l);
		const s = structuredClone(base);
		s.bracelet!.lines[4] = { kind: 'stat', index: 74, value: 500 };
		const part = simulate(l, s, base).parts.find((p) => p.type === PartType.BraceletStatType)!;
		expect(part.value).toBeCloseTo(350, 6);
	});

	it('counts index 11 (all main stats) like the class main stat', () => {
		const l = soulshan as unknown as Loadout;
		const base = initSimState(l);
		const withStat = (index: number) => {
			const s = structuredClone(base);
			s.bracelet!.lines[4] = { kind: 'stat', index, value: 1000 };
			return simulate(l, s, base);
		};
		const before = simulate(l, base, base);
		expect(withStat(11).mainStat).toBe(before.mainStat + 1000);
		expect(withStat(11).cp).toBeCloseTo(withStat(mainStatIndex(l)).cp, 10);
		// Vitality has no DPS value: same as emptying the line.
		const empty = structuredClone(base);
		empty.bracelet!.lines[4] = { kind: 'empty' };
		expect(withStat(6).cp).toBeCloseTo(simulate(l, empty, base).cp, 10);
	});
});
