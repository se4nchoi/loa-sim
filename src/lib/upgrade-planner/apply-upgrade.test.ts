import { describe, expect, it } from 'vitest';
import { applyUpgrade } from './apply-upgrade';
import brushann from './fixtures/na-brushann.json';
import soulshan from './fixtures/na-soulshan.json';
import { initSimState, simulate } from './simulate';
import type { Loadout } from './types';
import { buildUpgrades } from './upgrades';
import { honingUpgrades } from './honing-upgrades';

describe.each([
	['dealer (Soulshan)', soulshan],
	['support (Brushann)', brushann]
])('apply Next Upgrades: %s', (_, fixture) => {
	const l = fixture as unknown as Loadout;
	const base = initSimState(l);
	const cp0 = simulate(l, base, base).cp;

	it('every suggestion can be applied, and exact ones give the promised gain', () => {
		const ups = buildUpgrades(l, honingUpgrades(l));
		expect(ups.length).toBeGreaterThan(5);
		expect(ups.some((u) => u.category === 'honing')).toBe(true);
		for (const u of ups) {
			const s = structuredClone(base);
			expect(applyUpgrade(l, s, base, u), u.key).toBe(true);
			const pct = (simulate(l, s, base).cp / cp0 - 1) * 100;
			// Astrogem rows are an average over 5 levels; approximate rows rest on an assumption.
			// Honing rows are scored by the simulator itself, so they match exactly.
			if (u.category === 'honing') expect(pct, u.key).toBeCloseTo(u.gainPct, 9);
			else if (u.category === 'astrogem' || u.approximate) expect(pct, u.key).toBeGreaterThan(0);
			else expect(pct, u.key).toBeCloseTo(u.gainPct, 6);
		}
	});

	it('applying a gem row twice levels a second gem', () => {
		const gem = buildUpgrades(l).find((u) => u.category === 'gem' && u.count > 1)!;
		const s = structuredClone(base);
		applyUpgrade(l, s, base, gem);
		applyUpgrade(l, s, base, gem);
		const level = Number(gem.key.split(':')[2]);
		expect(s.gems.filter((g) => g.level === level + 1).length - base.gems.filter((g) => g.level === level + 1).length).toBe(2);
	});
});
