// The last character a player pasted, kept in their browser so a return visit opens straight into it.

import type { CharacterData } from '$lib/bible-data';

const KEY = 'loa-eff:character';

export interface SavedCharacter extends CharacterData {
	savedAt: number;
}

export function saveCharacter(data: CharacterData) {
	try {
		localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() } satisfies SavedCharacter));
	} catch {
		// Storage full or blocked (private mode); the simulator still works for this visit via sessionStorage.
		try {
			sessionStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
		} catch {
			/* nothing else to try */
		}
	}
}

export function loadSavedCharacter(): SavedCharacter | null {
	for (const store of [() => localStorage, () => sessionStorage]) {
		try {
			const raw = store().getItem(KEY);
			if (raw) return JSON.parse(raw) as SavedCharacter;
		} catch {
			/* try the next store */
		}
	}
	return null;
}

export function clearSavedCharacter() {
	for (const store of [() => localStorage, () => sessionStorage]) {
		try {
			store().removeItem(KEY);
		} catch {
			/* ignore */
		}
	}
}
