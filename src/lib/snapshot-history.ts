// Earlier lostark.bible snapshots of each saved character, kept in this browser. bible only lists a character's
// latest raid snapshot and its current estimate, so gear the player has since swapped out (or that a snapshot caught
// unequipped) would otherwise be gone; keeping each one lets the player simulate from the snapshot that has it.

import type { CharacterData, LoadoutKind } from '$lib/bible-data';
import type { Loadout } from '$lib/upgrade-planner/types';

const KEY = 'loa-sim:snapshots';
/** Per character, newest kept. A loadout is roughly 15–40 KB, so this stays well inside browser storage. */
export const MAX_SNAPSHOTS = 8;

export interface Snapshot {
	/** Which of bible's loadouts it was, e.g. "current:1760000000000:6620.18". */
	id: string;
	kind: LoadoutKind;
	/** When bible took it (the loadout's lastUpdated), else when it was loaded here. */
	takenAt: number;
	loadout: Loadout;
}

type Store = Record<string, Snapshot[]>;

export const snapshotId = (kind: LoadoutKind, l: Loadout) => `${kind}:${l.lastUpdated ?? 0}:${l.combatPower?.score ?? 0}`;

function read(): Store {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {};
	} catch {
		return {};
	}
}

/** Writes, dropping the oldest snapshots across all characters while storage is full. */
function write(store: Store) {
	for (;;) {
		try {
			localStorage.setItem(KEY, JSON.stringify(store));
			return;
		} catch {
			const oldest = Object.entries(store)
				.flatMap(([key, list]) => list.map((s) => ({ key, s })))
				.sort((a, b) => a.s.takenAt - b.s.takenAt)[0];
			if (!oldest) return; // storage blocked (private mode): nothing to keep
			store[oldest.key] = store[oldest.key].filter((s) => s !== oldest.s);
			if (!store[oldest.key].length) delete store[oldest.key];
		}
	}
}

/** Adds the loadouts in a load that aren't kept yet (same kind, snapshot time and score = the same snapshot). */
export function recordSnapshots(key: string, data: Pick<CharacterData, 'loadouts'>, now = Date.now()) {
	const store = read();
	const list = store[key] ?? [];
	let added = false;
	for (const kind of ['current', 'estimated'] as const) {
		const loadout = data.loadouts?.[kind];
		if (!loadout) continue;
		const id = snapshotId(kind, loadout);
		if (list.some((s) => s.id === id)) continue;
		list.push({ id, kind, takenAt: loadout.lastUpdated ?? now, loadout });
		added = true;
	}
	if (!added) return;
	store[key] = list.sort((a, b) => b.takenAt - a.takenAt).slice(0, MAX_SNAPSHOTS);
	write(store);
}

/** A character's kept snapshots, newest first. */
export const listSnapshots = (key: string): Snapshot[] => read()[key] ?? [];

export const findSnapshot = (key: string, id: string) => listSnapshots(key).find((s) => s.id === id) ?? null;

export function forgetSnapshots(key: string) {
	const store = read();
	if (!(key in store)) return;
	delete store[key];
	write(store);
}

