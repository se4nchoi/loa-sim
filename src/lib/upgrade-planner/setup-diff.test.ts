import { describe, expect, it } from 'vitest';
import { decodeSnapshot, isSnapshotHash, type ClearSnapshot } from '$lib/bible-data';
import soulshan from './fixtures/na-soulshan.json';
import type { Loadout } from './types';
import { sameGear, setupDiff } from './setup-diff';

const loadout = soulshan as unknown as Loadout;
const asSnapshot = (l: Loadout): ClearSnapshot => structuredClone({ classId: l.classId, items: l.items, gems: l.gems, arkGridCores: l.arkGridCores, engravings: l.engravings, karma: l.karma, combatPower: l.combatPower });

describe('clear snapshots', () => {
	it('recognizes LOA Logs loadout hashes', () => {
		expect(isSnapshotHash('v3/a1232f4eb7caa59021f608f0a992459a2680c51c47c5580d83e31168b2e29fbd')).toBe(true);
		expect(isSnapshotHash('v3/zzz')).toBe(false);
		expect(isSnapshotHash('../v3/a1232f4eb7caa59021f608f0a992459a2680c51c47c5580d83e31168b2e29fbd')).toBe(false);
	});
	it('decodes the snapshot page data (devalue)', () => {
		const body = { type: 'data', nodes: [{ type: 'data', data: [{ userData: -1 }] }, { type: 'data', data: [{ snapshot: 1 }, { classId: 2, combatPower: 3, items: 5 }, 'soul_eater', { id: 1, score: 4 }, 6523.07, []] }] };
		const snap = decodeSnapshot(body);
		expect(snap.classId).toBe('soul_eater');
		expect(snap.combatPower?.score).toBe(6523.07);
		expect(() => decodeSnapshot({ type: 'data', nodes: [] })).toThrow();
	});
});

describe('setup diff', () => {
	it('the same setup has no differences', () => {
		const d = setupDiff(loadout, asSnapshot(loadout));
		expect(d).toEqual({ gear: [], gems: false, cores: null, passives: [], other: [] });
		expect(sameGear(d)).toBe(true);
	});
	it('names differing gear slots and notices gem changes', () => {
		const snap = asSnapshot(loadout);
		const weapon = snap.items!.find((i) => i.slot === 'weapon')!;
		(weapon.data as { honing: number }).honing -= 1;
		snap.gems![0] = { ...snap.gems![0], id: snap.gems![0].id - 1 };
		const d = setupDiff(loadout, snap);
		expect(d.gear).toEqual(['Weapon']);
		expect(d.gems).toBe(true);
		expect(sameGear(d)).toBe(false);
	});
	it('names the Ark Passive nodes only one side takes, and ignores slots a snapshot lacks', () => {
		const now = { ...loadout, arkPassive: { enlightenment: [{ id: 2460000, level: 3 }, { id: 2460100, level: 3 }] } } as Loadout;
		const snap = { ...asSnapshot(loadout), arkPassive: { enlightenment: [{ id: 2460000, level: 3 }, { id: 2460300, level: 3 }] } };
		snap.items = snap.items!.filter((i) => i.slot !== 'bracelet');
		const d = setupDiff(now, snap);
		expect(d.passives).toEqual([{ tree: 'Enlightenment', clear: ['Execution Enhancement'], now: ['Full Moon Harvester'] }]);
		expect(d.gear).toEqual([]);
	});
});
