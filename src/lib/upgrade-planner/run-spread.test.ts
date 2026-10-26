import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import { dpsSpread, sameGearRuns } from './run-spread';

const run = (id: number, dps: number, extra: Partial<RunSummary> = {}) => ({
	id, start: id, boss: 'Death Incarnate Kazeros', difficulty: 'Hard', cleared: true, player: 'Soulshan', duration: 400_000,
	combatPower: 6620.18, spec: 'Full Moon Harvester', loadoutHash: 'v3/a', damage: dps * 400, skills: [], ...extra
}) as unknown as RunSummary;

describe('same-gear spread', () => {
	// Soulshan's Kazeros G2 on unchanged gear (10-26): 822m on 10-15, 887m on 10-08.
	const runs = [run(1, 822e6), run(2, 887e6), run(3, 950e6, { loadoutHash: 'v3/b' }), run(4, 700e6, { difficulty: 'Normal' }), run(5, 800e6, { cleared: false })];
	it('takes cleared runs of the same fight on the same gear snapshot', () => {
		expect(sameGearRuns(runs[0], runs).map((r) => r.id)).toEqual([1, 2]);
		expect(dpsSpread(runs[0], runs)).toEqual({ low: 822e6, high: 887e6, count: 2 });
	});
	it('without snapshots, the same recorded CP and spec', () => {
		const bare = [run(1, 822e6, { loadoutHash: undefined }), run(2, 887e6, { loadoutHash: undefined }), run(3, 900e6, { loadoutHash: undefined, combatPower: 6390 }), run(4, 910e6, { loadoutHash: undefined, spec: "Night's Edge" })];
		expect(sameGearRuns(bare[0], bare).map((r) => r.id)).toEqual([1, 2]);
	});
	it('needs two runs', () => {
		expect(dpsSpread(runs[2], runs)).toBeNull();
	});
});
