import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import type { Loadout } from './types';
import { checkEngravings, engravingNames, raidLoadout } from './dps-loadout';

const gear = (updated: number, ...ids: number[]) => ({ lastUpdated: updated, engravings: ids.map(id => ({ id, grade: 'relic', progress: 20 })) }) as unknown as Loadout;
const run = { engravings: ['Adrenaline', 'Grudge', 'Super Charge', 'Defense Reduction'] } as unknown as RunSummary;
// Grudge 1118, Super Charge 1121, Raid Captain 1254, Adrenaline 1299.
const raid = gear(1, 1299, 1118, 1121);
const pumped = gear(2, 1299, 1118, 1254);

describe('raid loadout check', () => {
	it('names engravings', () => expect(engravingNames(raid)).toEqual(['Adrenaline', 'Grudge', 'Super Charge']));
	it('flags a gatekeeping swap', () => {
		expect(checkEngravings(pumped, run)).toEqual({ notInRun: ['Raid Captain'], notInGear: ['Super Charge', 'Defense Reduction'] });
		expect(checkEngravings(raid, run)?.notInRun).toEqual([]);
		expect(checkEngravings(raid, { engravings: [] } as unknown as RunSummary)).toBeNull();
	});
	it('offers the newest loadout that matches the run', () => {
		const options = [{ loadout: pumped, ref: 'estimated', label: 'Estimated' }, { loadout: raid, ref: 'current', label: 'Raid snapshot' }, { loadout: gear(0, 1299, 1121), ref: 'old', label: 'Old' }];
		expect(raidLoadout(options, run)?.ref).toBe('current');
		expect(raidLoadout(options.slice(0, 1), run)).toBeNull();
	});
});
