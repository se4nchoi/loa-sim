import { describe, expect, it } from 'vitest';
import inconsistent from './fixtures/na-soulshan-merged-inconsistent.json';
import soulshan from './fixtures/na-soulshan.json';
import brushann from './fixtures/na-brushann.json';
import { roleOf, simulationBaseline } from './roles';
import { initSimState, simulate } from './simulate';
import { simulationCP, type SavedSimulation } from './saved-simulations';
import type { Loadout } from './types';

const loadout = inconsistent as unknown as Loadout;

describe('inconsistent merged snapshot regression (Soulshan/XjevsAoV)', () => {
	it('shows the non-scoring fifth engraving instead of an empty slot', () => {
		const state = initSimState(loadout);
		expect(Object.keys(state.engravings)).toHaveLength(5);
		expect(state.engravings[1109]).toEqual({ books: 0, stone: 0 });
		expect(state.engravings[1118]).toBeUndefined();
		expect(roleOf(loadout).engraving(1109)?.table[0][0]).toBe(0);
	});
	it('uses supplied gear CP instead of scaling it by the stale recorded score', () => {
		const base = initSimState(loadout);
		const baseline = simulationBaseline(loadout, simulate(loadout, base, base).cp);
		expect(baseline.mismatch).toBe(true);
		expect(baseline.reported).toBe(6620.18);
		expect(baseline.cp).toBeCloseTo(5471.22, 2);
		const plan = { loadout, state: base } as SavedSimulation;
		expect(simulationCP(plan)).toBeCloseTo(5471.22, 2);
		const state = structuredClone(base);
		state.engravings[1109] = { books: 4, stone: 0, as: 1118 };
		expect(simulationCP({ ...plan, state })).toBeCloseTo(6620.18, 2);
	});
	it.each([['dealer', soulshan], ['support', brushann]])('preserves the recorded score for a consistent %s snapshot', (_, fixture) => {
		const l = fixture as unknown as Loadout;
		const base = initSimState(l);
		expect(simulationBaseline(l, simulate(l, base, base).cp)).toEqual({ cp: l.combatPower!.score, reported: l.combatPower!.score, mismatch: false });
	});
});
