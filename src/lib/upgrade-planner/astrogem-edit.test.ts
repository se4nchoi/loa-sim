import { describe, expect, it } from 'vitest';
import { astrogemAs, astrogemTypeChoices, setAstrogemType } from './astrogem-edit';
import { ASTROGEM_ITEMS, ASTROGEM_KINDS, ITEMS } from './game-data';
import { initSimState, optionLevel, simCorePoints, simulate, type SimAstrogem, type SimCore } from './simulate';
import { astrogemWillpower } from './arkgrid-optimize';
import { decodeCore } from './tables';
import drkuuljulian from './fixtures/ce-drkuuljulian.json';
import type { Loadout } from './types';

const corrosion = (): SimAstrogem => ({
	itemId: 67411325, corePoints: 5, costReduc: 5,
	opts: [{ id: 2001, level: 4 }, { id: 2002, level: 5 }]
});

describe('astrogem type changes', () => {
	it('preserves cuts and the compatible option without introducing duplicate or invalid options', () => {
		const source = corrosion();
		const changed = astrogemAs(source, 67411525);
		expect(changed).toEqual({ ...source, itemId: 67411525, opts: [{ id: 2003, level: 4 }, { id: 2002, level: 5 }] });
		expect(source).toEqual(corrosion());
	});

	it('keeps support options as support options when replacing incompatible types', () => {
		const gem = { ...corrosion(), opts: [{ id: 2011, level: 3 }, { id: 2012, level: 5 }] };
		expect(astrogemAs(gem, 67411525).opts).toEqual([{ id: 2013, level: 3 }, { id: 2012, level: 5 }]);
	});

	it('only offers the same grade and core attribute, including ordinary replacements for event gems', () => {
		const core: SimCore = { id: 673121006, gems: [{ ...corrosion(), itemId: 40621175 }] };
		const choices = astrogemTypeChoices(core, decodeCore(core.id)!, 0);
		expect(choices.map((c) => c.name)).toEqual(['None', 'Corrosion', 'Distortion', 'Destruction']);
		for (const c of choices.filter((c) => c.itemId !== 0)) {
			expect(ITEMS[c.itemId][2]).toBe(6);
			expect(ASTROGEM_KINDS[ASTROGEM_ITEMS[c.itemId]].attr).toBe('chaos');
		}
		expect(astrogemAs(corrosion(), 67401225)).toEqual(corrosion());
		expect(astrogemAs(corrosion(), 67411526)).toEqual(corrosion());
	});

	it('blocks an over-cap swap on Relic and allows it after simulating Ancient', () => {
		const core: SimCore = { id: 673121005, gems: Array.from({ length: 4 }, corrosion) };
		const info = decodeCore(core.id)!;
		expect(setAstrogemType(core, info, 0, 67411525)).toBe(true); // 14 / 15
		const choice = astrogemTypeChoices(core, info, 1).find((c) => c.name === 'Destruction')!;
		expect(choice).toMatchObject({ total: 16, cap: 15, fits: false });
		const before = structuredClone(core);
		expect(setAstrogemType(core, info, 1, choice.itemId)).toBe(false);
		expect(core).toEqual(before);
		core.grade = 'ancient';
		expect(astrogemTypeChoices(core, info, 1).find((c) => c.itemId === choice.itemId)).toMatchObject({ total: 16, cap: 17, fits: true });
		expect(setAstrogemType(core, info, 1, choice.itemId)).toBe(true);
		core.grade = 'legendary';
		expect(astrogemTypeChoices(core, info, 2).filter((c) => c.itemId !== 0).every((c) => !c.fits)).toBe(true);
	});

	it('permits a swap exactly at the capacity', () => {
		const core: SimCore = { id: 673121005, gems: [corrosion(), corrosion(), corrosion(), { ...corrosion(), costReduc: 4 }] };
		expect(astrogemTypeChoices(core, decodeCore(core.id)!, 0).find((c) => c.name === 'Destruction')).toMatchObject({ total: 15, cap: 15, fits: true });
	});

	it('frees Willpower by removing a gem, allows another type change, and guards re-equipping', () => {
		const core: SimCore = { id: 673121005, gems: Array.from({ length: 4 }, corrosion) };
		const info = decodeCore(core.id)!;
		expect(setAstrogemType(core, info, 0, 67411525)).toBe(true);
		expect(setAstrogemType(core, info, 1, 67411525)).toBe(false);
		expect(setAstrogemType(core, info, 2, 0)).toBe(true);
		expect(astrogemWillpower(core.gems[2])).toBe(0);
		expect(setAstrogemType(core, info, 1, 67411525)).toBe(true);
		expect(setAstrogemType(core, info, 2, 67411325)).toBe(false);
		core.grade = 'ancient';
		expect(setAstrogemType(core, info, 2, 67411325)).toBe(true);
		expect(core.gems[2]).toEqual(corrosion());
	});

	it('removes all points and options from CP while keeping the slot restorable', () => {
		const l = drkuuljulian as unknown as Loadout;
		const base = initSimState(l);
		const state = structuredClone(base);
		const core = state.arkGrid.find((c) => c.id === 673121006)!;
		const gem = structuredClone(core.gems[0]);
		const info = decodeCore(core.id)!;
		const points = simCorePoints(l, state, base, core.id);
		const level = optionLevel(state.arkGrid, 2003);
		expect(setAstrogemType(core, info, 0, 0)).toBe(true);
		expect(simCorePoints(l, state, base, core.id)).toBe(points - gem.corePoints);
		expect(optionLevel(state.arkGrid, 2003)).toBe(level - gem.opts.find((o) => o.id === 2003)!.level);
		const physicallyRemoved = structuredClone(state);
		physicallyRemoved.arkGrid.find((c) => c.id === core.id)!.gems.splice(0, 1);
		expect(simulate(l, state, base)).toEqual(simulate(l, physicallyRemoved, base));
		expect(setAstrogemType(core, info, 0, gem.itemId)).toBe(true);
		expect(simulate(l, state, base)).toEqual(simulate(l, base, base));
	});

	it('recomputes CP from the remapped options and supports resetting the gem', () => {
		const l = structuredClone(drkuuljulian) as unknown as Loadout;
		// Better cost-reduction cuts make room for the more expensive type on this Ancient core.
		l.arkGridCores!.find((c) => c.id === 673101006)!.gems.forEach((g) => g.costReduc = 5);
		const base = initSimState(l);
		const s = structuredClone(base);
		const ci = s.arkGrid.findIndex((c) => c.id === 673101006);
		const core = s.arkGrid[ci];
		const before = simulate(l, s, base);
		expect(setAstrogemType(core, decodeCore(core.id)!, 0, 67411526)).toBe(true);
		expect(core.gems[0].opts).toEqual([{ id: 2003, level: 5 }, { id: 2002, level: 5 }]);
		expect(simulate(l, s, base).cp).toBeGreaterThan(before.cp);
		core.gems[0] = structuredClone(base.arkGrid[ci].gems[0]);
		expect(simulate(l, s, base)).toEqual(before);
	});
});
