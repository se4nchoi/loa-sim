import { describe, expect, it } from 'vitest';
import raw from './upgrade-planner/fixtures/mathi-soulshan-v3.json';
import expected from './upgrade-planner/fixtures/mathi-soulshan-v3-expected.json';
import soulshan from './upgrade-planner/fixtures/na-soulshan.json';
import { decodeLoadoutSnapshot, loadoutSnapshotUrl } from './loadout-snapshot';
import { clearState } from './upgrade-planner/clear-state';
import { initSimState, simulate } from './upgrade-planner/simulate';
import type { Loadout } from './upgrade-planner/types';

// Mathi's supplied hash; expected is the same public bible snapshot decoded independently on 2026-10-22.
const hash = 'v3/36a26708fae48f6b0a05ce80d57fe5e0fb530383a3c8377f5382995a23feeac4';

describe('Mathi loadout API adapter', () => {
	it('preserves every field used by the clear baseline, matching the bible snapshot exactly', () => {
		expect(decodeLoadoutSnapshot(raw)).toEqual(expected);
		expect(loadoutSnapshotUrl(hash)).toBe(`https://loadout.mathi.moe/v3/loadouts/by-hash/${hash.split('/')[1]}`);
	});
	it('carries the historical gear, gems, engravings and real order cores into the simulator', () => {
		const loadout = soulshan as unknown as Loadout;
		const state = clearState(loadout, decodeLoadoutSnapshot(raw)).state;
		expect(state.gear).toEqual(initSimState(loadout).gear);
		expect(state.gems[5]).toMatchObject({ level: 10, kind: 'damage', skill: 46430 });
		expect(state.engravings[1247]).toMatchObject({ books: 4, stone: 2 });
		expect(state.arkGrid.some((c) => c.as === 673012435)).toBe(true);
		expect(simulate(loadout, state).cp).toBeGreaterThan(0);
	});
	it.each([null, {}, { ...raw, equipped_items: null }, { ...raw, class: '405' }, { ...raw, loadout: { type: 'legacy' } }])('rejects malformed or incompatible payloads', (body) => {
		expect(() => decodeLoadoutSnapshot(body)).toThrow('unsupported snapshot');
	});
	it('rejects a changed nested stat schema rather than dropping a damage line', () => {
		const changed = structuredClone(raw);
		(changed.equipped_items[0].item_data.rolled_stats![0] as unknown as Record<string, unknown>).addon_type = '2';
		expect(() => decodeLoadoutSnapshot(changed)).toThrow('unsupported snapshot');
	});
	it.each(['../v3/' + 'a'.repeat(64), 'v3/not-a-hash', 'https://example.com'])('rejects invalid hashes before requesting anything', (hash) => {
		expect(() => loadoutSnapshotUrl(hash)).toThrow('Unknown snapshot');
	});
});
