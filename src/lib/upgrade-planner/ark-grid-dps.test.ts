import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import soulshan from './fixtures/na-soulshan.json';
import { activeEffects, orderCoreEffect } from './ark-grid-dps';
import { initSimState, simCorePoints } from './simulate';
import type { Loadout } from './types';

const loadout = soulshan as unknown as Loadout;
const FOOTSTEPS_RELIC = 673002435, FOOTSTEPS_ANCIENT = 673002436;
const ASTAROS = 46430, VESTIGE = 46530, FATALITY = 46630;
const skill = (id: number, damage: number, arkGrid?: Record<number, number>) => ({ id, damage, critDamage: 0, hits: 1, crits: 0, casts: 1, ...(arkGrid ? { arkGrid } : {}) });
const run = (skills: RunSummary['skills']) => ({ id: 1, skills, damage: skills.reduce((s, k) => s + k.damage, 0) }) as RunSummary;

// The fixture's sun core slot, played as Footsteps of the Dead (as a clear's setup has it).
const anchor = initSimState(loadout);
const sun = anchor.arkGrid.findIndex((c) => String(c.id).slice(3, 5) === '00');
// Grades are kept relative to the slot's own core (the fixture's is ancient), as the Simulator's picker sets them.
const withFootsteps = (grade: 'relic' | 'ancient' = 'relic') => {
	const s = structuredClone(anchor);
	const own = String(s.arkGrid[sun].id).endsWith('6') ? 'ancient' : 'relic';
	// Astrogems at full Willpower efficiency, so they all fit a relic core too (17P either way).
	s.arkGrid[sun] = { ...s.arkGrid[sun], as: FOOTSTEPS_RELIC, gems: s.arkGrid[sun].gems.map((g) => ({ ...g, costReduc: 5 })), ...(grade !== own ? { grade } : {}) };
	return s;
};

describe('order core effects', () => {
	it('reads Footsteps of the Dead by points, the ancient Destiny buff replacing the relic one', () => {
		const relic = activeEffects(FOOTSTEPS_RELIC, 20), ancient = activeEffects(FOOTSTEPS_ANCIENT, 20);
		expect(relic.always.reduce((s, e) => s + (e.pct ?? 0), 0)).toBeCloseTo(0.03 + 3 * 0.006);
		expect([...relic.destiny.values()].flat().map((e) => e.pct)).toEqual([0.54]);
		expect([...ancient.destiny.values()].flat().map((e) => e.pct)).toEqual([0.64]);
		expect(activeEffects(FOOTSTEPS_RELIC, 14).destiny.size).toBe(0);
	});

	it('relic → ancient raises only the Stygian damage dealt under the Destiny buff', () => {
		for (const g of ['relic', 'ancient'] as const) expect(simCorePoints(loadout, withFootsteps(g), anchor, anchor.arkGrid[sun].id)).toBeGreaterThanOrEqual(17);
		const r = run([skill(ASTAROS, 1000, { 3461200: 655 }), skill(VESTIGE, 1000, { 3461200: 1000 }), skill(FATALITY, 100, {})]);
		const e = orderCoreEffect(loadout, withFootsteps(), withFootsteps('ancient'), r);
		expect(e.changed).toBe(true);
		expect(e.factor(r.skills[0])).toBeCloseTo(1 + 0.655 * (1.64 / 1.54 - 1), 9);
		expect(e.factor(r.skills[1])).toBe(1);
		expect(e.factor(r.skills[2])).toBe(1);
	});

	it("can't value Destiny effects on logs imported before the buffs were kept", () => {
		const r = run([skill(ASTAROS, 1000)]);
		const e = orderCoreEffect(loadout, withFootsteps(), withFootsteps('ancient'), r);
		expect(e.factor(r.skills[0])).toBe(1);
		expect(e.unvalued.some((u) => u.includes('imported again'))).toBe(true);
	});

	it('no core change, no effect', () => {
		const r = run([skill(ASTAROS, 1000, {})]);
		expect(orderCoreEffect(loadout, withFootsteps(), withFootsteps(), r).changed).toBe(false);
	});
});
