import { describe, expect, it } from 'vitest';
import { publicDpsSample } from './public-dps-samples';
import { withGemGroups, gemDpsGainPct } from './dps';
import type { SimGem, GemPart } from './simulate';

describe('confirmed Shanzkii public clears', () => {
	it('keeps gate-specific crit sensitivities and public provenance separate from hit replay', () => {
		const cathedral = publicDpsSample('NA/Shanzkii', '6bHvxtb')!;
		const kazeros = publicDpsSample('na/shanzkii', '91Vm5pv')!;
		expect(cathedral.values?.critRate).toBe(.53);
		expect(kazeros.values?.critRate).toBe(.12);
		expect(kazeros.publicLog?.url).toBe('https://lostark.bible/logs/91Vm5pv');
		expect(kazeros.sample).toBeUndefined();
		expect(publicDpsSample('na/soulshan', '91Vm5pv')).toBeNull();
		expect(publicDpsSample('na/shanzkii', 'unknown')).toBeNull();
	});
	it('combines both Twelve Forms skills without renormalizing missing damage', () => {
		const sample = publicDpsSample('na/shanzkii', '6bHvxtb')!;
		const before: SimGem[] = [{ skill: 47000, level: 9, kind: 'damage', tier: 'T4' }];
		const after: SimGem[] = [{ ...before[0], level: 10 }];
		const shares = withGemGroups(before, sample.skillShares!);
		expect(shares[47000]).toBeCloseTo(48.1);
		expect(sample.publicLog?.skillCoverage).toBeCloseTo(94.4);
		expect(gemDpsGainPct(before, after, [] as GemPart[], shares)).toBeCloseTo(48.1 * (1.44 / 1.40 - 1));
		expect(shares[47200]).toBeUndefined();
	});
});
