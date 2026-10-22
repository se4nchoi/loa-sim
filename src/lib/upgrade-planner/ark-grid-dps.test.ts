import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import soulshan from './fixtures/na-soulshan.json';
import { activeEffects, buffMatches, critProfile, critRatio, orderCoreEffect } from './ark-grid-dps';
import { ORDER_CORE_EFFECTS } from './order-cores';
import { initSimState, simCorePoints } from './simulate';
import type { Loadout } from './types';

const loadout = soulshan as unknown as Loadout;
const FOOTSTEPS_RELIC = 673002435, FOOTSTEPS_ANCIENT = 673002436;
const ASTAROS = 46430, VESTIGE = 46530, FATALITY = 46630;
const skill = (id: number, damage: number, buffs?: Record<number, number>) => ({ id, damage, critDamage: 0, hits: 1, crits: 0, casts: 1, ...(buffs ? { buffs } : {}) });
const NAMES = { 3461200: 'Destiny: Footsteps of the Dead', 460501: 'Deathlord Mode' };
const run = (skills: RunSummary['skills'], buffNames: Record<number, string> = NAMES) => ({ id: 1, skills, damage: skills.reduce((s, k) => s + k.damage, 0), buffNames }) as RunSummary;

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
		expect(relic.effects.get('#')!.reduce((s, e) => s + (e.pct ?? 0), 0)).toBeCloseTo(0.03 + 3 * 0.006);
		expect(relic.effects.get('state:Destiny: Footsteps of the Dead#')!.map((e) => e.pct)).toEqual([0.54]);
		expect(ancient.effects.get('state:Destiny: Footsteps of the Dead#')!.map((e) => e.pct)).toEqual([0.64]);
		expect(activeEffects(FOOTSTEPS_RELIC, 14).effects.has('state:Destiny: Footsteps of the Dead#')).toBe(false);
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
		expect(e.unvalued.some((u) => u.includes('re-import'))).toBe(true);
	});

	it('values "In Deathlord Mode" effects on the damage dealt in Deathlord Mode', () => {
		// Soul Core (moon) reaching 17P: In Deathlord Mode, Stygian Skill Damage +18%.
		const SOUL_CORE = 673012436;
		const moon = anchor.arkGrid.findIndex((c) => String(c.id).slice(3, 5) === '01');
		const after = structuredClone(anchor);
		after.arkGrid[moon] = { ...after.arkGrid[moon], as: SOUL_CORE, grade: 'ancient', gems: after.arkGrid[moon].gems.map((g) => ({ ...g, costReduc: 5 })) };
		const before = structuredClone(after);
		before.arkGrid[moon].gems = before.arkGrid[moon].gems.map((g, i) => (i < 2 ? { ...g, removed: true } : g));
		const id = after.arkGrid[moon].id;
		expect(simCorePoints(loadout, after, anchor, id)).toBeGreaterThanOrEqual(17);
		expect(simCorePoints(loadout, before, anchor, id)).toBeLessThan(17);
		const r = run([skill(ASTAROS, 1000, { 460501: 500 }), skill(VESTIGE, 1000, { 460501: 1000 })]);
		const e = orderCoreEffect(loadout, before, after, r);
		expect(e.factor(r.skills[0])).toBeCloseTo(1 + 0.5 * 0.18 * (1.006 ** 0), 1);
		expect(e.factor(r.skills[0])).toBeGreaterThan(1.08);
		expect(e.factor(r.skills[1])).toBe(1);
	});

	it("doesn't value core swaps, and names them", () => {
		const r = run([skill(ASTAROS, 1000, {})]);
		const e = orderCoreEffect(loadout, anchor, withFootsteps('ancient'), r);
		expect(e.factor(r.skills[0])).toBe(1);
		expect(e.unvalued[0]).toContain("Deathlord's Call → Footsteps of the Dead");
	});

	it('reads crit-only and back-attack effects onto their part of the damage', () => {
		const effects = Object.values(ORDER_CORE_EFFECTS).flat();
		expect(effects.some((e) => e.crit && e.pct)).toBe(true);
		expect(effects.some((e) => e.position === 'front')).toBe(true);
	});

	it('values crit changes on the logged crit rate and crit multiplier', () => {
		// 50% crits, crits hit 2.5x: +25% Crit Damage → (1 + 0.5 x 1.75) / (1 + 0.5 x 1.5) = 1.0714...
		expect(critRatio(0.5, 2.5, 0, 0.25)).toBeCloseTo(1.875 / 1.75, 9);
		// +10% Crit Rate at 95% stops at 100%.
		expect(critRatio(0.95, 2, 0.1, 0)).toBeCloseTo(2 / 1.95, 9);
		const run = { skills: [{ id: 1, damage: 3500, critDamage: 2500, hits: 20, crits: 10, casts: 1 }, { id: 2, damage: 100, critDamage: 0, hits: 1, crits: 0, casts: 1 }] } as unknown as RunSummary;
		const c = critProfile(run);
		expect(c(run.skills[0]).multiplier).toBeCloseTo(2.5, 9); // 250 per crit, 100 per non-crit
		expect(c(run.skills[1]).multiplier).toBeCloseTo(2.5, 9); // too few hits: the run's
		expect(c(run.skills[0]).rate).toBe(0.5);
		// With LOA Logs' value for +1% Crit Damage (0.27% here, 2500 of 3600 damage on crits): 0.694 / 0.27 = 2.57.
		const logged = critProfile({ ...run, statValues: { critDamage: 0.27 } } as unknown as RunSummary);
		expect(logged(run.skills[1]).multiplier).toBeCloseTo((2500 / 3600) / 0.27, 9);
	});

	it('finds a state under its logged buff name', () => {
		expect(buffMatches('Level 3 Hype', 'Hype Mode')).toBe(true);
		expect(buffMatches('Brawl King Stance', 'Brawl King Stance')).toBe(true);
		expect(buffMatches('Destiny: Decimation', 'Destiny: Decimation')).toBe(true);
		expect(buffMatches('Deathlord Mode', 'Possession')).toBe(false);
	});

	it('no core change, no effect', () => {
		const r = run([skill(ASTAROS, 1000, {})]);
		expect(orderCoreEffect(loadout, withFootsteps(), withFootsteps(), r).changed).toBe(false);
	});
});
