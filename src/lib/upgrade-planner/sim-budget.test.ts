import { describe, expect, it } from 'vitest';
import soulshan from './fixtures/na-soulshan.json';
import { initSimState } from './simulate';
import { budgetChanges, budgetPriceUpgrades, priceBudget, type BudgetChange } from './sim-budget';
import { tapsFor } from './honing-cost';
import type { Loadout } from './types';

const loadout = soulshan as unknown as Loadout;
describe('current changes budget', () => {
	it('compares the final state with the original, so resets clear the budget', () => {
		const base = initSimState(loadout), target = structuredClone(base);
		expect(budgetChanges(loadout, base, target)).toEqual([]);
		target.gear.head!.honing += 2;
		target.gems[0].level = 10;
		expect(budgetChanges(loadout, base, target).map((r) => r.title)).toEqual(['Head +21 → +22', 'Head +22 → +23', 'Gem 1: Lv. 9 → 10']);
		expect(budgetChanges(loadout, base, structuredClone(base))).toEqual([]);
	});
	it('shares bound materials across steps without modifying saved stock', () => {
		const tap = { ...tapsFor('serca', 'head', 1)!, success: 10000, growth: 0, shards: 0, gold: 10, mats: { material: 10 }, breath: { id: 0, max: 0, rate: 0 } };
		const rows: BudgetChange[] = [1, 2].map((n) => ({ key: `${n}`, title: `Step ${n}`, detail: '', section: 'Equipment', tap }));
		const stock = { material: 15 };
		const priced = priceBudget(rows, { material: 2 }, stock, {}, {});
		expect(priced.map((r) => r.average)).toEqual([10, 20]);
		expect(priced.map((r) => r.inventory)).toEqual([[{ id: 'material', average: 10, averageBuy: 0 }], [{ id: 'material', average: 5, averageBuy: 5 }]]);
		expect(stock.material).toBe(15);
	});
	it('flags missing prices instead of presenting a complete free budget', () => {
		const tap = { ...tapsFor('serca', 'head', 1)!, success: 10000, growth: 0, shards: 0, mats: { unpriced: 10 }, breath: { id: 0, max: 0, rate: 0 } };
		const row: BudgetChange = { key: 'test', title: 'Honing', detail: '', section: 'Equipment', tap };
		expect(priceBudget([row], {}, {}, {}, {})[0].missing).toEqual(['unpriced']);
		expect(priceBudget([row], {}, {}, {}, {})[0].inventory?.find((m) => m.id === 'unpriced')).toEqual({ id: 'unpriced', average: 0, averageBuy: 10 });
		expect(priceBudget([row], {}, { unpriced: 10 }, {}, {})[0].missing).toEqual([]);
	});
	it('carries expected remaining inventory through the average path', () => {
		const tap = { ...tapsFor('serca', 'head', 1)!, success: 5000, failBonus: 0, failMax: 0, energy: 10000, growth: 0, shards: 0, gold: 10, mats: { material: 10 }, breath: { id: 0, max: 0, rate: 0 } };
		const rows: BudgetChange[] = [
			{ key: 'first', title: 'First', section: 'Equipment', detail: '', tap },
			{ key: 'next', title: 'Next', section: 'Equipment', detail: '', tap: { ...tap, success: 10000, mats: { material: 50 } } }
		];
		const priced = priceBudget(rows, { material: 2 }, { material: 35 }, {}, {});
		expect(priced[0].inventory).toEqual([{ id: 'material', average: 17.5, averageBuy: 0 }]);
		expect(priced[1].inventory).toEqual([{ id: 'material', average: 17.5, averageBuy: 32.5 }]);
		expect(priced[0]).not.toHaveProperty('pity');
	});
	it('uses per-gem upgrade quotes for each changed gem and per-book prices', () => {
		const base = initSimState(loadout), target = structuredClone(base);
		target.gems[0].level = 10;
		target.gems[1].level = 10;
		base.engravings[1254].books = 2;
		target.engravings[1254].books = 4;
		const priced = priceBudget(budgetChanges(loadout, base, target), {}, {}, { 'gem:T4:9': 50000 }, { 1254: 1000 });
		expect(priced.map((r) => r.average)).toEqual([50000, 50000, 10000]);
	});
	it('lists RNG changes without assigning them gold prices', () => {
		const base = initSimState(loadout), target = structuredClone(base);
		target.arkGrid[0].gems[0].corePoints++;
		target.bracelet = { lines: [{ kind: 'empty' }] };
		const changes = budgetChanges(loadout, base, target);
		expect(changes).toHaveLength(2);
		expect(changes.every((r) => r.status === 'rng')).toBe(true);
		expect(priceBudget(changes, {}, {}, Object.fromEntries(changes.map((r) => [r.key, 1000])), {}).every((r) => r.average === undefined)).toBe(true);
	});
	it('reuses a saved whole-accessory quote when its target rolls match', () => {
		const base = initSimState(loadout), target = structuredClone(base);
		target.accessories.ear1 = [{ key: 'atk_pct', tier: 'high' }, { key: 'weapon_pct', tier: 'high' }, { key: 'atk_flat', tier: 'high' }];
		const rows = budgetChanges(loadout, base, target);
		expect(rows[0].sourceKey).toBe('accset:ear1:atk_pct.high,weapon_pct.high,atk_flat.high');
		expect(rows[0].title).toBe('Earring 1');
		expect(rows[0].rolls?.map((r) => r.tier)).toEqual(['high', 'high', 'high']);
		expect(priceBudget(rows, {}, {}, { [rows[0].sourceKey!]: 100000 }, {})[0].average).toBe(100000);
		expect(priceBudget(rows, {}, {}, { 'accset:ear1:weapon_pct.high,atk_flat.high,atk_pct.high': 120000 }, {})[0].average).toBe(120000);
		target.accessoryStats.ear1 = (base.accessoryStats.ear1 ?? 0) + 100;
		expect(budgetChanges(loadout, base, target)[0].sourceKey).toBeUndefined();
	});
	it('opens the exact planned accessory for pricing even if it is absent from the suggested ladder', () => {
		const base = initSimState(loadout), target = structuredClone(base);
		target.accessories.finger1 = [{ key: 'crit_dmg', tier: 'high' }, { key: 'crit_rate', tier: 'high' }, { key: 'other', label: 'Other' }];
		target.accessoryStats.finger1 = (base.accessoryStats.finger1 ?? 0) + 100;
		const row = budgetChanges(loadout, base, target)[0];
		const upgrade = budgetPriceUpgrades(loadout, base, target).find((u) => u.key === row.key);
		expect(upgrade?.subject).toBe('Ring 1');
		expect(upgrade?.lines).toEqual(row.rolls);
		expect(priceBudget([row], {}, {}, { [upgrade!.key]: 50000 }, {})[0].average).toBe(50000);
	});
	it('prices the full bracer progression including unpriced limit breaks', () => {
		const base = initSimState(loadout), target = structuredClone(base);
		base.bracer = null;
		target.bracer = { grade: 'ancient', honing: 25 };
		const changes = budgetChanges(loadout, base, target);
		expect(changes.filter((r) => r.tap)).toHaveLength(25);
		expect(changes.filter((r) => r.status === 'unavailable')).toHaveLength(3);
		expect(changes[0].fixed).toBe(0);
	});
});
