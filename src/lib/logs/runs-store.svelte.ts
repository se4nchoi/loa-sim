// The player's imported LOA Logs runs, kept per character in this browser only (never uploaded). The DPS tab reads
// every answer from these: which gates were cleared, skill damage shares, crit, and the meter's stat values.

import type { RunSummary } from './protocol';

const PREFIX = 'loa-sim:dps-runs:v1:';

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

/** Reads (and caches) a character's runs; null when none were imported in this browser. */
export function loadRuns(characterKey: string, force = false): RunsBook | null {
	if (!force && characterKey in runsBooks.byCharacter) return runsBooks.byCharacter[characterKey];
	let book: RunsBook | null = null;
	try {
		const v = JSON.parse(localStorage.getItem(PREFIX + characterKey) ?? 'null');
		if (v && Array.isArray(v.runs)) book = v;
	} catch {
		// unreadable or blocked storage: no runs
	}
	runsBooks.byCharacter[characterKey] = book;
	return book;
}

/** Saves (or with null, forgets) a character's runs. Returns false when storage refused them. */
export function saveRuns(characterKey: string, book: RunsBook | null): boolean {
	runsBooks.byCharacter[characterKey] = book;
	try {
		if (book) localStorage.setItem(PREFIX + characterKey, JSON.stringify(book));
		else localStorage.removeItem(PREFIX + characterKey);
		return true;
	} catch {
		return false;
	}
}
