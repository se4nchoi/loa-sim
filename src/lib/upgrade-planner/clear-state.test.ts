import { describe, expect, it } from 'vitest';
import type { ClearSnapshot } from '$lib/bible-data';
import soulshan from './fixtures/na-soulshan.json';
import { clearState } from './clear-state';
import { orbChoices } from './paradise';
import { initSimState, simulate } from './simulate';
import type { Loadout } from './types';

const loadout = soulshan as unknown as Loadout;
const asSnapshot = (l: Loadout): ClearSnapshot => structuredClone({ classId: l.classId, items: l.items, gems: l.gems, arkGridCores: l.arkGridCores, engravings: l.engravings, karma: l.karma, combatPower: l.combatPower });
const cp = (s: ReturnType<typeof initSimState>) => simulate(loadout, s).cp;

describe('a clear snapshot as a Simulator state', () => {
	it('reads historical weapon quality instead of carrying today’s CP quality part into the snapshot', () => {
		const snap = asSnapshot(loadout);
		const weapon = snap.items!.find(i => i.slot === 'weapon')!;
		weapon.data.stats!.find(s => s.type === 2 && s.index === 50 && s.base)!.value = 1500; // Quality 50.
		expect(initSimState(loadout).quality.weapon).toBe(100);
		expect(clearState(loadout, snap).state.quality.weapon).toBe(50);
	});
	it('the loadout\'s own setup scores the loadout\'s CP', () => {
		const { state } = clearState(loadout, asSnapshot(loadout));
		const base = initSimState(loadout);
		expect(state.gear).toEqual(base.gear);
		expect(state.gems).toEqual(base.gems);
		expect(state.engravings).toEqual(base.engravings);
		expect(state.arkGrid).toEqual(base.arkGrid);
		expect(cp(state)).toBeCloseTo(cp(base), 6);
	});

	it('carries the clear\'s honing over and scores it lower', () => {
		const snap = asSnapshot(loadout);
		const weapon = snap.items!.find((i) => i.slot === 'weapon')!;
		(weapon.data as unknown as { honing: number }).honing -= 1;
		const { state } = clearState(loadout, snap);
		expect(cp(state)).toBeLessThan(cp(initSimState(loadout)));
	});

	it('puts another Ark Grid core on the loadout\'s core of the same shape', () => {
		const snap = asSnapshot(loadout);
		const ids = loadout.arkGridCores!.map((c) => c.id);
		snap.arkGridCores![1] = { ...snap.arkGridCores![1], id: 673012435 };
		const { state } = clearState(loadout, snap);
		expect(state.arkGrid.map((c) => c.id)).toEqual(ids);
		expect(state.arkGrid[1].gems).toEqual(initSimState(loadout).arkGrid[1].gems);
	});

	it('reads relic books from progress, and keeps the loadout\'s gems when the count differs', () => {
		const snap = asSnapshot(loadout);
		snap.engravings![0] = { ...snap.engravings![0], grade: 'engrave_grade04', progress: 10 };
		snap.gems = snap.gems!.slice(1);
		const { state, notes } = clearState(loadout, snap);
		expect(state.engravings[snap.engravings![0].id].books).toBe(2);
		expect(state.gems).toEqual(initSimState(loadout).gems);
		expect(notes.some((n) => n.includes('number of gems'))).toBe(true);
	});
});

describe('the clear\'s Paradise orb', () => {
	it('is the closest orb at or just above the recorded CP', () => {
		const base = initSimState(loadout);
		if (!base.paradise || base.paradise.flat) return;
		const other = orbChoices(base.paradise).find((id) => id !== base.paradise!.orb && cp({ ...base, paradise: { ...base.paradise!, orb: id } }) < cp(base) * 0.995)!;
		const snap = asSnapshot(loadout);
		snap.combatPower = { id: 1, score: cp({ ...base, paradise: { ...base.paradise, orb: other } }) * 0.999 };
		const { orb, state } = clearState(loadout, snap);
		expect(orb).not.toBeNull();
		expect(cp(state) / snap.combatPower.score - 1).toBeGreaterThanOrEqual(-0.0005);
		expect(cp(state) / snap.combatPower.score - 1).toBeLessThanOrEqual(0.01);
		expect(clearState(loadout, asSnapshot(loadout)).orb).toBeNull();
	});
	it("is the run's own when its orb proc is in the logs (Sunlight Fragrance → Blazing Sun), whatever the CP says", () => {
		const base = initSimState(loadout);
		if (!base.paradise || base.paradise.flat) return;
		const BLAZING_SUN = 657830002;
		const { orb, state, notes } = clearState(loadout, asSnapshot(loadout), [{ id: 46430 }, { id: 171001001 }]);
		expect(orb).toBe(base.paradise.orb === BLAZING_SUN ? null : BLAZING_SUN);
		expect(state.paradise!.orb).toBe(BLAZING_SUN);
		if (orb) expect(notes.some((n) => n.includes("run's orb proc"))).toBe(true);
	});
});
