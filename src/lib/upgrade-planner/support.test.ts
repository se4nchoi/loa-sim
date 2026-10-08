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
	supportWeaponCoreStats,
	supportEngravingTable,
	swappedCoreId
} from './support';
import { gemParts, initSimState, simulate, type SimState } from './simulate';
import type { Loadout } from './types';
import { buildUpgrades, coreStates } from './upgrades';

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

	it('event gems (6509xxxx) read as the regular gem they stand for', () => {
		const event = gemParts(l).filter((g) => String(g.id).startsWith('6509'));
		expect(event.length).toBeGreaterThan(0);
		for (const g of event) expect(g.table, `gem ${g.id}`).not.toBeNull();
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

	it('Weapon core effects accumulate through the active breakpoint', () => {
		expect(supportWeaponCoreStats(673121005, 17)).toEqual({ flat: 3900, percent: 2.25 });
		expect(supportWeaponCoreStats(673121006, 17)).toEqual({ flat: 5200, percent: 3 });
		expect(supportWeaponCoreStats(673121006, 20).percent).toBeCloseTo(3.69);
		expect(supportWeaponCoreStats(673121004, 20)).toEqual({ flat: 1300, percent: 0.75 });
		expect(supportWeaponCoreStats(673121006, 9)).toEqual({ flat: 0, percent: 0 });
	});
});

describe('support simulation (Brushann)', () => {
	const base = initSimState(l);
	const before = supportCombatPower(parts);
	const sim = (mutate: (s: SimState) => void) => {
		const s = structuredClone(base);
		mutate(s);
		return simulate(l, s, base);
	};
	const pct = (cp: number) => (cp / before.total - 1) * 100;

	it('starts at the support score from bible parts', () => {
		expect(simulate(l, base, base).cp).toBeCloseTo(before.total, 6);
	});

	it('a gem level moves Buff Power only', () => {
		const i = base.gems.findIndex((g) => g.level === 7);
		const r = sim((s) => (s.gems[i].level = 8));
		const after = supportCombatPower(r.parts);
		expect(after.shieldHeal).toBeCloseTo(before.shieldHeal, 6);
		expect(after.buff / before.buff).toBeCloseTo((1e4 + 1000) / (1e4 + 875), 6);
	});

	it('a Shield & Heal engraving moves Shield & Heal Power only', () => {
		const r = sim((s) => (s.engravings[1301].books = 4));
		const after = supportCombatPower(r.parts);
		expect(after.buff).toBeCloseTo(before.buff, 6);
		expect(after.shieldHeal).toBeGreaterThan(before.shieldHeal);
	});

	it('an engraving added in an empty slot scores (Crushing Fist)', () => {
		expect(Object.keys(base.engravings)).not.toContain('1236');
		const r = sim((s) => (s.engravings[1236] = { books: 4, stone: 0, added: true }));
		const after = supportCombatPower(r.parts);
		expect(after.buff / before.buff).toBeCloseTo(1 + supportEngravingTable(1236)!.table[0][4] / 1e4, 6);
		expect(after.shieldHeal).toBeCloseTo(before.shieldHeal, 6);
	});

	it('swapping a chaos core option uses the support table', () => {
		const moon = coreStates(l).find((c) => c.id === 673113005)!;
		const r = sim((s) => (s.arkGrid.find((c) => c.id === moon.id)!.grade = 'ancient'));
		const part = r.parts.find((p) => p.id === moon.id && (p.type === PartType.ArkGridCore || p.type === PartType.ArkGridCoreDefense))!;
		expect(part.value).toBe(supportCoreValue(673113006, moon.points).value);
	});

	it('upgrading Weapon increases Buff Power, while swapping to Salvation removes its weapon stats', () => {
		const weapon = base.arkGrid.find((c) => c.id === 673121005)!;
		const upgraded = supportCombatPower(sim((s) => (s.arkGrid.find((c) => c.id === weapon.id)!.grade = 'ancient')).parts);
		expect(upgraded.buff).toBeGreaterThan(before.buff);
		expect(upgraded.shieldHeal).toBeCloseTo(before.shieldHeal, 6);
		const salvation = supportCombatPower(sim((s) => {
			const core = s.arkGrid.find((c) => c.id === weapon.id)!;
			core.grade = 'ancient';
			core.variant = 2;
		}).parts);
		expect(salvation.buff).toBeLessThan(before.buff);
		expect(salvation.shieldHeal / before.shieldHeal).toBeCloseTo(1.0672, 6);
		expect(salvation.total).toBeLessThan(upgraded.total);
	});

	it('Weapon point upgrades agree between Next Upgrades and simulation', () => {
		const core = base.arkGrid.find((c) => c.id === 673121005)!;
		const r = sim((s) => { s.arkGrid.find((c) => c.id === core.id)!.gems[0].corePoints += 1; });
		const upgrade = buildUpgrades(l).find((u) => u.key === 'core:673121005:18')!;
		expect(upgrade.gainPct).toBeGreaterThan(0);
		expect(upgrade.gainPct).toBeCloseTo(pct(r.cp), 4);
	});

	it('bracelet Ally Atk. Power Enhancement lines score part 19', () => {
		const at = base.bracelet!.lines.findIndex((x) => x.kind === 'stat' && x.type === 54);
		expect(at).toBeGreaterThanOrEqual(0);
		const r = sim((s) => ((s.bracelet!.lines[at] as { value: number }).value = 500));
		expect(r.parts.find((p) => p.type === PartType.BraceletStatType)!.value).toBeCloseTo(375, 6);
		expect(pct(r.cp)).toBeGreaterThan(0);
	});

	it('Next Upgrades ranks support upgrades and matches the simulator', () => {
		const ups = buildUpgrades(l);
		expect(ups.length).toBeGreaterThan(5);
		for (let i = 1; i < ups.length; i++) expect(ups[i - 1].gainPct).toBeGreaterThanOrEqual(ups[i].gainPct);
		const gem = ups.find((u) => u.key === 'gem:T4:7')!;
		const i = base.gems.findIndex((g) => g.level === 7);
		expect(gem.gainPct).toBeCloseTo(pct(sim((s) => (s.gems[i].level = 8)).cp), 6);
	});
});
