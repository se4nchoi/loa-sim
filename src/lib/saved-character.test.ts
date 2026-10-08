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
