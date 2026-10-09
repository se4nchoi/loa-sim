import { beforeEach, describe, expect, it } from 'vitest';
import { characterKey, listSavedCharacters, saveCharacter, setLoadoutKind } from './saved-character';
import type { Loadout } from './upgrade-planner/types';

// A small in-memory localStorage for the node test environment.
const store = new Map<string, string>();
Object.assign(globalThis, {
	localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
	sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
});

const lo = (score: number) => ({ type: 'ark_passive', classId: 'blade', itemLevel: 1805, battlePoint: { isSupport: false, parts: [] }, combatPower: { id: 1, score } }) as unknown as Loadout;

describe('setLoadoutKind', () => {
	beforeEach(() => store.clear());

	it('switches a saved character between its loadouts and keeps when it was loaded', () => {
		const current = lo(3967.86);
		const estimated = lo(9476.77);
		saveCharacter({ name: 'Legendarymember', region: 'NA', header: null, loadout: estimated, loadouts: { current, estimated }, loadoutKind: 'estimated' });
		const savedAt = listSavedCharacters()[0].savedAt;
		const key = characterKey({ region: 'NA', name: 'Legendarymember' });
		const switched = setLoadoutKind(key, 'current')!;
		expect(switched.loadoutKind).toBe('current');
		expect(switched.loadout?.combatPower?.score).toBe(3967.86);
		expect(listSavedCharacters()[0]).toMatchObject({ loadoutKind: 'current', savedAt });
	});

	it('does nothing for a loadout the character does not have', () => {
		saveCharacter({ name: 'Old', region: 'NA', header: null, loadout: lo(1) });
		expect(setLoadoutKind('na/old', 'estimated')).toBeNull();
	});
});

describe('saveCharacter keeps an estimate bible dropped', () => {
	beforeEach(() => store.clear());
	const base = { name: 'Shanzkii', region: 'NA', header: null };

	it('keeps the earlier estimate when a reload has none and it still scores higher', () => {
		saveCharacter({ ...base, loadout: lo(3600), loadouts: { current: lo(3550), estimated: lo(3600) }, loadoutKind: 'estimated' });
		const first = listSavedCharacters()[0];
		saveCharacter({ ...base, loadout: lo(3509.12), loadouts: { current: lo(3509.12) }, loadoutKind: 'current' });
		const c = listSavedCharacters()[0];
		expect(c.loadouts?.estimated?.combatPower?.score).toBe(3600);
		expect(c.loadoutKind).toBe('estimated');
		expect(c.loadout?.combatPower?.score).toBe(3600);
		expect(c.estimatedAt).toBe(first.estimatedAt);
	});

	it('drops it once the new snapshot scores at least as high', () => {
		saveCharacter({ ...base, loadout: lo(3600), loadouts: { current: lo(3550), estimated: lo(3600) }, loadoutKind: 'estimated' });
		saveCharacter({ ...base, loadout: lo(3650), loadouts: { current: lo(3650) }, loadoutKind: 'current' });
		const c = listSavedCharacters()[0];
		expect(c.loadouts?.estimated).toBeUndefined();
		expect(c.loadout?.combatPower?.score).toBe(3650);
	});
});
