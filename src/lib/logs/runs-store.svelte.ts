// The player's imported LOA Logs runs, kept per character in this browser only (never uploaded). The DPS tab reads
// every answer from these: which gates were cleared, skill damage shares, crit, and the meter's stat values.
//
// They live in IndexedDB: a few hundred runs are megabytes, and localStorage (where they used to be) gives a site about
// 5 MB for everything, saved characters and plans included. Runs still in localStorage move over the first time they
// are read. A small localStorage flag per character says whether runs exist, for the places that must know at once.

import type { RunSummary } from './protocol';

/** Where runs were kept before IndexedDB; read once more to move them. */
const LEGACY_PREFIX = 'loa-sim:dps-runs:v1:';
/** "This browser has runs for the character", readable synchronously. */
const FLAG_PREFIX = 'loa-sim:dps-runs:has:';
const DB_NAME = 'loa-sim-dps';
const STORE = 'runs';

export interface RunsBook {
	/** The in-game name the runs were recorded as. */
	player: string;
	fileName: string;
	importedAt: number;
	runs: RunSummary[];
	/** Skill id → [name, icon], shared by all runs. */
	skills: Record<number, [string, string]>;
}

export const runsBooks = $state<{ byCharacter: Record<string, RunsBook | null> }>({ byCharacter: {} });

const isBook = (v: unknown): v is RunsBook => !!v && typeof v === 'object' && Array.isArray((v as RunsBook).runs);

let opening: Promise<IDBDatabase | null> | undefined;
/** The database, or null where IndexedDB is missing or blocked (private windows in some browsers). */
function database(): Promise<IDBDatabase | null> {
	opening ??= new Promise((resolve) => {
		try {
			const request = indexedDB.open(DB_NAME, 1);
			request.onupgradeneeded = () => request.result.createObjectStore(STORE);
			request.onsuccess = () => resolve(request.result);
			request.onerror = request.onblocked = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
	return opening;
}

/** One request in its own transaction; rejects when the browser refuses it (over quota, for one). */
async function inStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
	const db = await database();
	if (!db) throw new Error('IndexedDB is unavailable');
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, mode);
		const request = run(tx.objectStore(STORE));
		tx.oncomplete = () => resolve(request.result);
		tx.onerror = tx.onabort = () => reject(tx.error ?? request.error);
	});
}

const legacy = {
	read(characterKey: string): RunsBook | null {
		try {
			const v = JSON.parse(localStorage.getItem(LEGACY_PREFIX + characterKey) ?? 'null');
			return isBook(v) ? v : null;
		} catch {
			return null; // unreadable or blocked storage: no runs
		}
	},
	remove(characterKey: string) {
		try { localStorage.removeItem(LEGACY_PREFIX + characterKey); } catch { /* blocked storage */ }
	}
};
function flag(characterKey: string, has: boolean) {
	try {
		if (has) localStorage.setItem(FLAG_PREFIX + characterKey, '1');
		else localStorage.removeItem(FLAG_PREFIX + characterKey);
	} catch { /* blocked storage: hasStoredRuns answers once the runs are read */ }
}

/** Reads (and caches) a character's runs; null when none were imported in this browser. */
export async function loadRuns(characterKey: string, force = false): Promise<RunsBook | null> {
	if (!force && characterKey in runsBooks.byCharacter) return runsBooks.byCharacter[characterKey];
	let book: RunsBook | null = null;
	try {
		const stored = await inStore('readonly', (s) => s.get(characterKey));
		if (isBook(stored)) book = stored;
	} catch { /* no IndexedDB: the localStorage copy, if any */ }
	if (!book) {
		book = legacy.read(characterKey);
		// Moved over once; the localStorage copy goes only after IndexedDB has it.
		if (book) try {
			await inStore('readwrite', (s) => s.put(book, characterKey));
			legacy.remove(characterKey);
		} catch { /* stays in localStorage */ }
	}
	flag(characterKey, !!book);
	// A save that finished while this read was underway is newer.
	if (force || !(characterKey in runsBooks.byCharacter)) runsBooks.byCharacter[characterKey] = book;
	return runsBooks.byCharacter[characterKey];
}

/** Whether this browser has runs for the character, without reading them (the DPS sim's loading skeleton). */
export function hasStoredRuns(characterKey: string): boolean {
	if (characterKey in runsBooks.byCharacter) return !!runsBooks.byCharacter[characterKey];
	try {
		return localStorage.getItem(FLAG_PREFIX + characterKey) !== null || localStorage.getItem(LEGACY_PREFIX + characterKey) !== null;
	} catch {
		return false;
	}
}

/** Saves (or with null, forgets) a character's runs. Resolves false when the browser refused them. */
export async function saveRuns(characterKey: string, book: RunsBook | null): Promise<boolean> {
	runsBooks.byCharacter[characterKey] = book;
	try {
		if (book) await inStore('readwrite', (s) => s.put(book, characterKey));
		else await inStore('readwrite', (s) => s.delete(characterKey));
		legacy.remove(characterKey);
		flag(characterKey, !!book);
		return true;
	} catch {
		// No IndexedDB (or it refused): localStorage as before, which may refuse a large import too.
		try {
			if (book) localStorage.setItem(LEGACY_PREFIX + characterKey, JSON.stringify(book));
			else localStorage.removeItem(LEGACY_PREFIX + characterKey);
			return true;
		} catch {
			return false;
		}
	}
}
