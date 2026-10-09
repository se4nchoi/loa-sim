import { describe, expect, it } from 'vitest';
import { applyUpgrade } from './apply-upgrade';
import { PartType, partHigh } from './cp';
import brushann from './fixtures/na-brushann.json';
import soulshan from './fixtures/na-soulshan.json';
import type { AccRoll } from './accessory-sets';
import { liveUpgrades } from './live-upgrades';
import { initSimState, simulate } from './simulate';
import { supportCombatPower, supportEngravingIds, supportEngravingTable } from './support';
import type { Loadout } from './types';

describe.each([['dealer', soulshan], ['support', brushann]])('live Next Upgrades: %s', (_, fixture) => {
	const l = fixture as unknown as Loadout;
	it('every displayed gain matches Apply, including after multiple different edits', () => {
		const base = initSimState(l);
		const current = structuredClone(base);
		current.gems.forEach((g) => g.level = 8);
		current.karma = { evolution: 3, enlightenment: 10, leap: 10 };
		current.gear.weapon!.honing = 20;
		for (let round = 0; round < 6; round++) {
			const cp = simulate(l, current, base).cp;
			const rows = liveUpgrades(l, current, base);
			expect(rows.length).toBeGreaterThan(5);
			for (const u of rows) {
				const next = structuredClone(current);
				expect(applyUpgrade(l, next, base, u), u.key).toBe(true);
				expect((simulate(l, next, base).cp / cp - 1) * 100, u.key).toBeCloseTo(u.gainPct, 9);
			}
			expect(applyUpgrade(l, current, base, rows[round % rows.length])).toBe(true);
		}
	});
	it('updates gem counts and removes completed engraving/accessory/honing upgrades', () => {
		const base = initSimState(l);
		const current = structuredClone(base);
		current.gems.forEach((g) => g.level = 10);
		current.gear.weapon!.honing = 25;
		Object.values(current.engravings).forEach((e) => e.books = 4);
		// Accessories are bought whole: buy each slot's best offer until none is left (at most one buy per slot).
		for (let i = 0; i < 5; i++) {
			const best = liveUpgrades(l, current, base).find((u) => u.key.startsWith('accset:'));
			if (!best) break;
			expect(applyUpgrade(l, current, base, best), best.key).toBe(true);
		}
		const rows = liveUpgrades(l, current, base);
		expect(rows.some((u) => u.category === 'gem' || u.category === 'engraving' || u.key.startsWith('honing:weapon:'))).toBe(false);
		expect(rows.some((u) => u.category === 'accessory')).toBe(false);
	});
});

it('Evolution rank 1 → 2 shows the level jump to 5 and prices one rank, not each level', () => {
	const l = structuredClone(soulshan) as unknown as Loadout;
	l.karma!.evolution = 1;
	l.battlePoint.parts.find((p) => p.type === PartType.KarmaEvolutionRank)!.value = 60;
	const base = initSimState(l);
	const row = liveUpgrades(l, base, base).find((u) => u.key === 'karma:evolution:2')!;
	expect(row.subject).toBe('Evolution Lv. 1 → 5');
	expect(row.gainPct).toBeCloseTo(60 / 10060 * 100, 9);
	const next = structuredClone(base);
	applyUpgrade(l, next, base, row);
	expect(next.karma.evolution).toBe(5);
});

it('support Evolution levels add Max HP and Shield & Heal Power even without a rank change', () => {
	const l = brushann as unknown as Loadout;
	const base = initSimState(l);
	const next = structuredClone(base);
	next.karma.evolution!++;
	const before = simulate(l, base, base);
	const after = simulate(l, next, base);
	const hp0 = before.parts.find((p) => p.type === PartType.BaseHealth)!;
	const hp1 = after.parts.find((p) => p.type === PartType.BaseHealth)!;
	const multiplier = (l.stats!.find((s) => s.type === 29)!.value / 10000);
	expect(Number(hp1.maxHp) - Number(hp0.maxHp)).toBeCloseTo(400 * multiplier, 9);
	expect(partHigh(hp1) / partHigh(hp0)).toBeCloseTo(Number(hp1.maxHp) / Number(hp0.maxHp), 9);
	expect(supportCombatPower(after.parts).buff).toBe(supportCombatPower(before.parts).buff);
	expect(supportCombatPower(after.parts).shieldHeal).toBeGreaterThan(supportCombatPower(before.parts).shieldHeal);
	expect(liveUpgrades(l, base, base).some((u) => u.key === `karma:evolution-level:${next.karma.evolution}`)).toBe(true);
});

it('imports equipped utility engravings and allows swapping them without inventing CP', () => {
	const l = brushann as unknown as Loadout;
	const base = initSimState(l);
	expect(Object.keys(base.engravings)).toHaveLength(5);
	expect(base.engravings[1240]).toEqual({ books: 2, stone: 0 });
	for (const id of [1142, 1167, 1240, 1109, 1140, 1241, 1168]) {
		expect(supportEngravingIds()).toContain(id);
		expect(supportEngravingTable(id)!.table.flat().every((v) => v === 0)).toBe(true);
	}
	const next = structuredClone(base);
	next.engravings[1240].as = 1142;
	expect(simulate(l, next, base).cp).toBe(simulate(l, base, base).cp);
	next.engravings[1240].as = 1236;
	expect(simulate(l, next, base).cp).toBeGreaterThan(simulate(l, base, base).cp);
});

describe('accessory rolls picker', () => {
	const l = soulshan as unknown as Loadout;
	const base = initSimState(l);
	const weak = structuredClone(base);
	for (const slot of ['neck', 'ear1', 'ear2', 'finger1', 'finger2'] as const)
		weak.accessories[slot] = [{ key: 'other', label: 'Other' }, { key: 'other', label: 'Other' }, { key: 'other', label: 'Other' }];
	const neck = (rolls: AccRoll[]) => liveUpgrades(l, weak, base, rolls).filter((u) => u.group === 'accset:neck');
	const mains = (u: ReturnType<typeof neck>[number]) => u.lines!.slice(0, 2).map((x) => x.tier[0]).join('');
	it('offers only the picked main rolls, all beating the current accessory', () => {
		expect(new Set(neck(['mm']).map(mains))).toEqual(new Set(['mm']));
		expect(new Set(neck(['hl', 'mm']).map(mains))).toEqual(new Set(['hl', 'mm']));
		expect(new Set(neck(['hm']).map(mains))).toEqual(new Set(['hm', 'mh']));
		for (const u of neck(['hh', 'hm', 'hl', 'lh', 'mm'])) expect(u.gainPct).toBeGreaterThan(0);
		expect(neck([])).toEqual([]);
	});
	it('stays quick with every roll picked', () => {
		const all: AccRoll[] = ['hh', 'hm', 'hl', 'lh', 'mm'];
		liveUpgrades(l, weak, base, all);
		const t = performance.now();
		for (let i = 0; i < 5; i++) liveUpgrades(l, weak, base, all);
		expect((performance.now() - t) / 5).toBeLessThan(200);
	});
});
