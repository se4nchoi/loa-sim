// Characters a player pasted, kept in their browser so return visits open straight into the simulator.
// Several characters can be kept; the most recently loaded comes first.

import type { CharacterData } from '$lib/bible-data';

const KEY = 'loa-sim:characters';
const LEGACY_KEY = 'loa-eff:character';
const MAX_SAVED = 12;

export interface SavedCharacter extends CharacterData {
	savedAt: number;
}

export const characterKey = (c: { region: string; name: string }) => `${c.region}/${c.name}`.toLowerCase();

function read(): SavedCharacter[] {
	for (const store of [() => localStorage, () => sessionStorage]) {
		try {
			const raw = store().getItem(KEY);
			if (raw) return JSON.parse(raw) as SavedCharacter[];
			// One-time migration from the single-character format.
			const legacy = store().getItem(LEGACY_KEY);
			if (legacy) return [JSON.parse(legacy) as SavedCharacter];
		} catch {
			/* try the next store */
		}
	}
	return [];
}

function write(list: SavedCharacter[]) {
	const json = JSON.stringify(list.slice(0, MAX_SAVED));
	try {
		localStorage.setItem(KEY, json);
		localStorage.removeItem(LEGACY_KEY);
	} catch {
		// Storage full or blocked (private mode): keep it for this visit at least.
		try {
			sessionStorage.setItem(KEY, json);
		} catch {
			/* nothing else to try */
		}
	}
}

export function saveCharacter(data: CharacterData) {
	const entry: SavedCharacter = { ...data, savedAt: Date.now() };
	write([entry, ...read().filter((c) => characterKey(c) !== characterKey(entry))]);
}

export const listSavedCharacters = (): SavedCharacter[] => read().sort((a, b) => b.savedAt - a.savedAt);

/** A saved character by key, or the most recent one. */
export function loadSavedCharacter(key?: string | null): SavedCharacter | null {
	const list = listSavedCharacters();
	return (key ? list.find((c) => characterKey(c) === key.toLowerCase()) : list[0]) ?? null;
}

export function removeSavedCharacter(key: string) {
	write(read().filter((c) => characterKey(c) !== key.toLowerCase()));
}
