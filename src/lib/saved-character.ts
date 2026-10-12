// Characters a player pasted, kept in their browser so return visits open straight into the simulator.
// Several characters can be kept; the most recently loaded comes first.

import type { CharacterData, LoadoutKind } from '$lib/bible-data';
import { findSnapshot, forgetSnapshots, recordSnapshots, removeSnapshot } from '$lib/snapshot-history';

const KEY = 'loa-sim:characters';
const LEGACY_KEY = 'loa-eff:character';
const MAX_SAVED = 24;
/** Characters shown in the simulator, newest first by first view (viewing one already listed keeps its place). */
const RECENT_KEY = 'loa-sim:recent';
/** The character last shown, so the Simulator tab returns to it. */
const LAST_KEY = 'loa-sim:last-viewed';
export const MAX_RECENT = 12;

export interface SavedCharacter extends CharacterData {
	savedAt: number;
	/** When lostark.bible last listed the estimated raid loadout (earlier than savedAt when it was kept, see below). */
	estimatedAt?: number;
	/** Set while an earlier kept snapshot is simulated (see snapshot-history); `loadout` is then that snapshot. */
	snapshotId?: string;
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

/**
 * Saves a load. A load only adds to what this browser keeps: the snapshots already here go into the history first, so
 * nothing is lost, and the new one is shown (gear can go down too, e.g. gems swapped to another character). A snapshot
 * picked from the history afterwards stays picked on later visits, until the next load.
 * bible sometimes drops a character's estimated raid loadout (e.g. right after a new raid snapshot);
 * then the previous estimate is kept, as long as it still scores above the new snapshot (otherwise the gear has
 * moved past it).
 */
export function saveCharacter(data: CharacterData) {
	const now = Date.now();
	const entry: SavedCharacter = { ...data, savedAt: now };
	const prev = read().find((c) => characterKey(c) === characterKey(data));
	const oldEstimate = prev?.loadouts?.estimated;
	if (data.loadouts?.estimated) entry.estimatedAt = now;
	else if (oldEstimate && data.loadouts?.current && (oldEstimate.combatPower?.score ?? 0) > (data.loadouts.current.combatPower?.score ?? 0)) {
		entry.loadouts = { ...data.loadouts, estimated: oldEstimate };
		entry.estimatedAt = prev.estimatedAt ?? prev.savedAt;
		entry.loadoutKind = prev.loadoutKind ?? 'estimated';
		entry.loadout = entry.loadouts[entry.loadoutKind] ?? data.loadout;
	}
	const key = characterKey(data);
	if (prev) recordSnapshots(key, prev, prev.savedAt);
	recordSnapshots(key, entry, now);
	write([entry, ...read().filter((c) => characterKey(c) !== key)]);
}

export const listSavedCharacters = (): SavedCharacter[] => read().sort((a, b) => b.savedAt - a.savedAt);

/** A saved character by key, or the most recent one. */
export function loadSavedCharacter(key?: string | null): SavedCharacter | null {
	const list = listSavedCharacters();
	if (!key) {
		let last: string | undefined;
		try {
			last = localStorage.getItem(LAST_KEY) ?? recentKeys()[0];
		} catch {
			/* storage blocked */
		}
		return list.find((c) => characterKey(c) === last) ?? list[0] ?? null;
	}
	return list.find((c) => characterKey(c) === key.toLowerCase()) ?? null;
}

/** Keys of the characters last viewed in the simulator, newest first. */
export function recentKeys(): string[] {
	try {
		const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
		return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
	} catch {
		return [];
	}
}

export function rememberViewed(key: string) {
	const k = key.toLowerCase();
	try {
		localStorage.setItem(LAST_KEY, k);
		const recent = recentKeys();
		// Stable order: no jumping when switching between characters already in the row.
		if (!recent.includes(k)) localStorage.setItem(RECENT_KEY, JSON.stringify([k, ...recent].slice(0, MAX_RECENT)));
	} catch {
		/* storage blocked: the tab falls back to the most recently loaded */
	}
}

export function removeSavedCharacter(key: string) {
	write(read().filter((c) => characterKey(c) !== key.toLowerCase()));
	forgetSnapshots(key.toLowerCase());
}

/** Switches a saved character between its estimated raid loadout and its latest raid snapshot. */
export function setLoadoutKind(key: string, kind: LoadoutKind): SavedCharacter | null {
	const list = read();
	const entry = list.find((c) => characterKey(c) === key.toLowerCase());
	const loadout = entry?.loadouts?.[kind];
	if (!entry || !loadout) return null;
	entry.loadout = loadout;
	entry.loadoutKind = kind;
	delete entry.snapshotId;
	write(list);
	return entry;
}

/** Simulates an earlier kept snapshot of a saved character (until it's switched back or loaded again). */
export function setSnapshot(key: string, id: string): SavedCharacter | null {
	const list = read();
	const entry = list.find((c) => characterKey(c) === key.toLowerCase());
	const snapshot = entry && findSnapshot(characterKey(entry), id);
	if (!entry || !snapshot) return null;
	entry.loadout = snapshot.loadout;
	entry.snapshotId = id;
	write(list);
	return entry;
}

/** Erases a kept snapshot; if it was being simulated, the character goes back to its chosen bible loadout. */
export function eraseSnapshot(key: string, id: string): SavedCharacter | null {
	removeSnapshot(key.toLowerCase(), id);
	const list = read();
	const entry = list.find((c) => characterKey(c) === key.toLowerCase());
	if (!entry) return null;
	if (entry.snapshotId === id) {
		entry.loadout = entry.loadouts?.[entry.loadoutKind ?? 'current'] ?? entry.loadout;
		delete entry.snapshotId;
		write(list);
	}
	return entry;
}
