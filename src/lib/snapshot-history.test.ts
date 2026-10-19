import { beforeEach, describe, expect, it } from 'vitest';
import { characterKey, eraseSnapshot, listSavedCharacters, removeSavedCharacter, saveCharacter, setLoadoutKind, setSnapshot } from './saved-character';
import { MAX_SNAPSHOTS, listSnapshots, recordSnapshots } from './snapshot-history';
import type { Loadout } from './upgrade-planner/types';

// A small in-memory localStorage for the node test environment, with an optional size limit.
const store = new Map<string, string>();
let limit = Infinity;
Object.assign(globalThis, {
	localStorage: {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => {
			if (v.length > limit) throw new Error('QuotaExceededError');
			store.set(k, v);
		},
		removeItem: (k: string) => store.delete(k)
	},
	sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
});

// Gear follows the score unless given, so different scores are different gear.
const lo = (score: number, lastUpdated: number, gear: number = score) =>
	({
		type: 'ark_passive', classId: 'blade', itemLevel: 1805, lastUpdated, battlePoint: { isSupport: false, parts: [{ type: 1, value: 10000 }] }, combatPower: { id: 1, score },
		items: [{ slot: 'weapon', id: gear, data: { type: 'weapon' } }]
	}) as unknown as Loadout;
const base = { name: 'Soulshan', region: 'NA', header: null };
const key = characterKey(base);

describe('snapshot history', () => {
	beforeEach(() => {
		store.clear();
		limit = Infinity;
	});
 it('keeps different simulation baselines at identical recorded CP and timestamp separately selectable', () => {
  const first = lo(6600, 1000), second = structuredClone(first);
  second.battlePoint.parts[0].value = 11000;
  recordSnapshots(key, {loadouts: {current: first}});
  const originalId = listSnapshots(key)[0].id;
  recordSnapshots(key, {loadouts: {current: second}});
  const snapshots = listSnapshots(key);
  expect(snapshots).toHaveLength(2);
  expect(new Set(snapshots.map((s) => s.id)).size).toBe(2);
  expect(snapshots.find((s) => s.id === originalId)?.loadout).toEqual(first);
  // Changed stat totals also affect future upgrade deltas, even with unchanged gear and recorded CP.
  const third = {...second, stats: [{type: 3, value: 20000}]};
  recordSnapshots(key, {loadouts: {current: third}});
  expect(listSnapshots(key)).toHaveLength(3);
 });
 it('ignores malformed history lists and entries while retaining valid older snapshots', () => {
  const good = { id: 'good', kind: 'current', takenAt: 1, loadout: lo(1234, 1) };
  store.set('loa-sim:snapshots', JSON.stringify({
   broken: {}, [key]: [null, {}, { ...good, id: 'bad', loadout: { battlePoint: { parts: null } } }, good]
  }));
  expect(listSnapshots('broken')).toEqual([]);
  expect(listSnapshots(key)).toEqual([good]);
  expect(() => recordSnapshots(key, { loadouts: { current: lo(2345, 2) } })).not.toThrow();
  expect(listSnapshots(key)).toHaveLength(2);
 });

	it('keeps each distinct snapshot across loads, newest first, without duplicates', () => {
		saveCharacter({ ...base, loadout: lo(6650, 1000), loadouts: { current: lo(6600, 1000), estimated: lo(6650, 1000) }, loadoutKind: 'estimated' });
		saveCharacter({ ...base, loadout: lo(6650, 1000), loadouts: { current: lo(6600, 1000), estimated: lo(6650, 1000) }, loadoutKind: 'estimated' });
		saveCharacter({ ...base, loadout: lo(6500, 2000), loadouts: { current: lo(6500, 2000) }, loadoutKind: 'current' });
		expect(listSnapshots(key).map((s) => [s.kind, s.loadout.combatPower?.score])).toEqual([
			['current', 6500],
			['current', 6600],
			['estimated', 6650]
		]);
	});

	it("treats the same gear as one snapshot, whatever bible's snapshot time, and moves its date up", () => {
		saveCharacter({ ...base, loadout: lo(6600, 1000), loadouts: { current: lo(6600, 1000) }, loadoutKind: 'current' });
		const id = listSnapshots(key)[0].id;
		saveCharacter({ ...base, loadout: lo(6600, 5000), loadouts: { current: lo(6600, 5000), estimated: lo(6600, 5000) }, loadoutKind: 'estimated' });
		expect(listSnapshots(key)).toMatchObject([{ id, takenAt: 5000 }]);
		// Different gear at the same CP is still its own snapshot.
		saveCharacter({ ...base, loadout: lo(6600, 6000, 1), loadouts: { current: lo(6600, 6000, 1) }, loadoutKind: 'current' });
		expect(listSnapshots(key)).toHaveLength(2);
		// So is the same gear at another CP (cards, collections, … changed), with its own CP kept.
		saveCharacter({ ...base, loadout: lo(6650, 7000, 1), loadouts: { current: lo(6650, 7000, 1) }, loadoutKind: 'current' });
		expect(listSnapshots(key).map((s) => s.loadout.combatPower?.score)).toEqual([6650, 6600, 6600]);
	});

	it('folds copies kept before gear was compared into the newest', () => {
		const copy = (t: number) => ({ id: `current:${t}:6600`, kind: 'current', takenAt: t, loadout: lo(6600, t) });
		store.set('loa-sim:snapshots', JSON.stringify({ [key]: [copy(1000), copy(2000), copy(3000)] }));
		recordSnapshots(key, { loadouts: { current: lo(6500, 4000) } });
		expect(listSnapshots(key).map((s) => [s.takenAt, s.loadout.combatPower?.score])).toEqual([[4000, 6500], [3000, 6600]]);
	});

	it('works fingerprints from an earlier rule out again instead of saving a copy', () => {
		store.set('loa-sim:snapshots', JSON.stringify({ [key]: [{ id: 'current:1000:6600', kind: 'current', takenAt: 1000, gear: 'old-rule', loadout: lo(6600, 1000) }] }));
		recordSnapshots(key, { loadouts: { current: lo(6600, 2000) } });
		expect(listSnapshots(key)).toMatchObject([{ id: 'current:1000:6600', takenAt: 2000 }]);
	});

	it('simulates an earlier snapshot until switched back or loaded again', () => {
		saveCharacter({ ...base, loadout: lo(6650, 1000), loadouts: { current: lo(6650, 1000) }, loadoutKind: 'current' });
		saveCharacter({ ...base, loadout: lo(6500, 2000), loadouts: { current: lo(6500, 2000) }, loadoutKind: 'current' });
		const old = listSnapshots(key).find((s) => s.loadout.combatPower?.score === 6650)!;
		const picked = setSnapshot(key, old.id)!;
		expect(picked.snapshotId).toBe(old.id);
		expect(picked.loadout?.combatPower?.score).toBe(6650);
		expect(listSavedCharacters()[0].loadout?.combatPower?.score).toBe(6650);
		expect(setLoadoutKind(key, 'current')!.snapshotId).toBeUndefined();
		setSnapshot(key, old.id);
		// A load shows bible's latest, even a lower one, and keeps the picked one in the history.
		saveCharacter({ ...base, loadout: lo(6510, 3000), loadouts: { current: lo(6510, 3000) }, loadoutKind: 'current' });
		expect(listSavedCharacters()[0].snapshotId).toBeUndefined();
		expect(listSavedCharacters()[0].loadout?.combatPower?.score).toBe(6510);
		expect(listSnapshots(key).map((s) => s.loadout.combatPower?.score)).toContain(6650);
		expect(setSnapshot(key, 'missing')).toBeNull();
	});

	it('a reload shows the latest and keeps the earlier one, even one saved before history was kept', () => {
		// Saved by an older version: in the character list, not in the history.
		const old = lo(6785, 1000);
		store.set('loa-sim:characters', JSON.stringify([{ ...base, loadout: old, loadouts: { current: old }, loadoutKind: 'current', savedAt: 1000 }]));
		saveCharacter({ ...base, loadout: lo(6389, 2000), loadouts: { current: lo(6389, 2000) }, loadoutKind: 'current' });
		const c = listSavedCharacters()[0];
		expect(c.loadout?.combatPower?.score).toBe(6389);
		expect(listSnapshots(key).map((s) => s.loadout.combatPower?.score).sort()).toEqual([6389, 6785]);
		// Picking the earlier one is remembered (read back from storage) until the next load.
		const earlier = listSnapshots(key).find((s) => s.loadout.combatPower?.score === 6785)!;
		setSnapshot(key, earlier.id);
		expect(listSavedCharacters()[0]).toMatchObject({ snapshotId: earlier.id, loadout: { combatPower: { score: 6785 } } });
	});

	it('erases a kept snapshot, going back to the bible loadout if it was simulated', () => {
		saveCharacter({ ...base, loadout: lo(6650, 1000), loadouts: { current: lo(6650, 1000) }, loadoutKind: 'current' });
		saveCharacter({ ...base, loadout: lo(6500, 2000), loadouts: { current: lo(6500, 2000) }, loadoutKind: 'current' });
		const old = listSnapshots(key).find((s) => s.loadout.combatPower?.score === 6650)!;
		setSnapshot(key, old.id);
		const back = eraseSnapshot(key, old.id)!;
		expect(back.snapshotId).toBeUndefined();
		expect(back.loadout?.combatPower?.score).toBe(6500);
		expect(listSnapshots(key).map((s) => s.loadout.combatPower?.score)).toEqual([6500]);
		expect(listSavedCharacters()[0].loadout?.combatPower?.score).toBe(6500);
	});

	it(`keeps at most ${MAX_SNAPSHOTS} per character and forgets them with the character`, () => {
		for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) recordSnapshots(key, { loadouts: { current: lo(6000 + i, 1000 + i) } });
		const kept = listSnapshots(key);
		expect(kept).toHaveLength(MAX_SNAPSHOTS);
		expect(kept[0].loadout.combatPower?.score).toBe(6000 + MAX_SNAPSHOTS + 2);
		saveCharacter({ ...base, loadout: lo(1, 1), loadouts: { current: lo(1, 1) }, loadoutKind: 'current' });
		removeSavedCharacter(key);
		expect(listSnapshots(key)).toEqual([]);
	});

	it('drops the oldest snapshots, across characters, when storage is full', () => {
		recordSnapshots('na/old', { loadouts: { current: lo(1, 100) } });
		recordSnapshots(key, { loadouts: { current: lo(2, 5000) } });
		limit = (store.get('loa-sim:snapshots')?.length ?? 0) + 10; // room for little more than what's there
		recordSnapshots(key, { loadouts: { current: lo(3, 6000) } });
		expect(listSnapshots('na/old')).toEqual([]);
		expect(listSnapshots(key).map((s) => s.loadout.combatPower?.score)).toEqual([3, 2]);
	});
});
