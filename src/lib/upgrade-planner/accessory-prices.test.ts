import { describe, expect, it } from 'vitest';
import { accessoryPriceKey, groupAccessoryUpgrades } from './accessory-sets';
import type { Upgrade } from './upgrades';
import { gold, manualGoldCost, setGoldCost } from './gold-costs.svelte';

const upgrade = (slot: string, subject: string, gainPct: number): Upgrade => ({ key: `accset:${slot}:atk_pct.high,weapon_pct.mid`, subject, gainPct, category: 'accessory', title: '', detail: '', count: 1, approximate: false });
describe('shared accessory prices', () => {
	it('replaces old slot-specific duplicates with one shared saved price', () => {
		const before = { ...gold.costs };
		const first = upgrade('ear1', 'Earring 1', 1), second = upgrade('ear2', 'Earring 2', 2);
		gold.costs = { [first.key]: 100, [second.key]: 200 };
		try {
			setGoldCost(second.key, 300);
			expect(Object.values(gold.costs)).toEqual([300]);
			expect(manualGoldCost(first, gold.costs)).toBe(300);
			expect(manualGoldCost(second, gold.costs)).toBe(300);
		} finally { gold.costs = before; }
	});
	it('shares matching prices across paired slots and display line order', () => {
		const price = { 'accset:ear1:weapon_pct.mid,atk_pct.high': 50000 };
		expect(accessoryPriceKey('accset:ear2:atk_pct.high,weapon_pct.mid', price)).toBe(Object.keys(price)[0]);
		expect(accessoryPriceKey('accset:ear2:atk_pct.mid,weapon_pct.high', price)).not.toBe(Object.keys(price)[0]);
		expect(accessoryPriceKey('accset:ear2:atk_pct.high,weapon_pct.mid', {})).toBe(accessoryPriceKey('accset:ear1:weapon_pct.mid,atk_pct.high', {}));
	});
	it('groups duplicate prices into three families while retaining slot-specific gains and Apply keys', () => {
		const first = upgrade('ear1', 'Earring 1', 1), second = upgrade('ear2', 'Earring 2', 2);
		const groups = groupAccessoryUpgrades([first, second]);
		expect(groups.map((g) => g.name)).toEqual(['Necklace', 'Earrings 1/2', 'Rings 1/2']);
		expect(groups[1].options).toHaveLength(1);
		expect(groups[1].options[0].variants).toEqual([first, second]);
	});
});
