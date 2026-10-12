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
	/** When bible last took it (the loadout's lastUpdated), else when it was loaded here. */
	takenAt: number;
	/** The gear's fingerprint (see gearKey); missing on entries saved before it was kept. */
	gear?: string;
	loadout: Loadout;
}

type Store = Record<string, Snapshot[]>;

export const snapshotId = (kind: LoadoutKind, l: Loadout) => `${kind}:${l.lastUpdated ?? 0}:${l.combatPower?.score ?? 0}`;

/**
 * What makes two snapshots the same: the gear itself (items, gems, ark grid, engravings, karma), not when bible took
 * it. bible re-snapshots and rebuilds its estimate without gear changes, which would otherwise fill the history with
 * copies. A short FNV-1a hash of that, so entries stay small.
 */
export function gearKey(l: Loadout): string {
	const text = JSON.stringify([l.classId, l.items ?? [], l.gems ?? [], l.arkGridCores ?? [], l.engravings ?? [], l.karma ?? null]);
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
	return `${h.toString(36)}:${text.length}`;
}
export const gearOf = (s: Snapshot) => s.gear ?? gearKey(s.loadout);

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

/**
 * Adds the loadouts in a load whose gear isn't kept yet. Gear that is (bible re-snapshotted it unchanged) only moves
 * that entry's date up, keeping its id so a choice of it still holds.
 */
export function recordSnapshots(key: string, data: Pick<CharacterData, 'loadouts'>, now = Date.now()) {
	const store = read();
	// Older entries were kept per snapshot time: fold copies of the same gear into the newest.
	const list: Snapshot[] = [];
	for (const s of (store[key] ?? []).toSorted((a, b) => b.takenAt - a.takenAt)) if (!list.some((k) => gearOf(k) === gearOf(s))) list.push(s);
	let changed = list.length !== (store[key]?.length ?? 0);
	for (const kind of ['current', 'estimated'] as const) {
		const loadout = data.loadouts?.[kind];
		if (!loadout) continue;
		const gear = gearKey(loadout);
		const takenAt = loadout.lastUpdated ?? now;
		const same = list.find((s) => gearOf(s) === gear);
		if (same) {
			if (takenAt > same.takenAt) ((same.takenAt = takenAt), (changed = true));
			if (!same.gear) ((same.gear = gear), (changed = true));
			continue;
		}
		list.push({ id: snapshotId(kind, loadout), kind, takenAt, gear, loadout });
		changed = true;
	}
	if (!changed) return;
	store[key] = list.sort((a, b) => b.takenAt - a.takenAt).slice(0, MAX_SNAPSHOTS);
	write(store);
}

/** A character's kept snapshots, newest first. */
export const listSnapshots = (key: string): Snapshot[] => read()[key] ?? [];

export const findSnapshot = (key: string, id: string) => listSnapshots(key).find((s) => s.id === id) ?? null;

export function removeSnapshot(key: string, id: string) {
	const store = read();
	const list = store[key]?.filter((s) => s.id !== id);
	if (!list || list.length === store[key].length) return;
	if (list.length) store[key] = list;
	else delete store[key];
	write(store);
}

export function forgetSnapshots(key: string) {
	const store = read();
	if (!(key in store)) return;
	delete store[key];
	write(store);
}

