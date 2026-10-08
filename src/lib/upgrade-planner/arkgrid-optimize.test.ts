import { describe, expect, it } from 'vitest';
import { astrogemWillpower, optimizeArkGrid, withArrangement } from './arkgrid-optimize';
import soulshan from './fixtures/na-soulshan.json';
import drkuuljulian from './fixtures/ce-drkuuljulian.json';
import { initSimState, simulate } from './simulate';
import { CORE_WILLPOWER, decodeCore } from './tables';
import type { Loadout } from './types';

const loadout = soulshan as unknown as Loadout;

describe('ark grid optimizer', () => {
	const base = initSimState(loadout);
	const cpOf = (s: ReturnType<typeof initSimState>) => simulate(loadout, s, base).cp;

	it('preserves the value of dealer Weapon core breakpoints when arranging gems', () => {
		const l = drkuuljulian as unknown as Loadout;
		const base = initSimState(l);
		const after = withArrangement(base, optimizeArkGrid(l, base, base));
		expect(simulate(l, after, base).cp).toBeGreaterThanOrEqual(simulate(l, base, base).cp - 1e-9);
	});

	it('never does worse than the current arrangement, and respects willpower and sockets', () => {
		const a = optimizeArkGrid(loadout, base, base);
		const after = withArrangement(base, a);
		expect(cpOf(after)).toBeGreaterThanOrEqual(cpOf(base) - 1e-9);
		for (const core of after.arkGrid) {
			const grade = decodeCore(core.id)!.grade;
			expect(core.gems.length).toBeLessThanOrEqual(4);
			expect(core.gems.reduce((s, g) => s + astrogemWillpower(g), 0)).toBeLessThanOrEqual(CORE_WILLPOWER[grade]);
		}
		// Every equipped gem is still placed somewhere (nothing is lost to the search).
		expect(after.arkGrid.reduce((s, c) => s + c.gems.length, 0) + a.leftOut.length).toBe(24);
	});

	it('recovers from a worse arrangement', () => {
		const bad = structuredClone(base);
		// Swap a 5P gem out of the relic order moon (20P) with a 4P gem from the ancient order sun (17P):
		// moon 19P, sun 18P instead of 20P / 17P.
		const sun = bad.arkGrid.find((c) => c.id === 673004436)!;
		const moon = bad.arkGrid.find((c) => c.id === 673014435)!;
		const i4 = sun.gems.findIndex((g) => g.corePoints === 4);
		const i5 = moon.gems.findIndex((g) => g.corePoints === 5);
		[sun.gems[i4], moon.gems[i5]] = [moon.gems[i5], sun.gems[i4]];
		const fixed = withArrangement(bad, optimizeArkGrid(loadout, bad, base));
		expect(cpOf(fixed)).toBeGreaterThanOrEqual(cpOf(base) - 1e-9);
		expect(cpOf(fixed)).toBeGreaterThan(cpOf(bad));
	});
});
