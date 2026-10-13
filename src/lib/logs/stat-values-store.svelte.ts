// The meter's per-stat values a player loaded from their LOA Logs, kept per character in this browser, so Next
// Upgrades can show DPS next to CP. Loaded with the damage shares (Gems card → Load shares from LOA Logs).

import type { StatValues, ReplayRun } from './protocol';

const KEY = 'loa-sim:stat-values';

export interface SavedStatValues {
	values: StatValues | null;
	/** Which runs they came from, e.g. "Last 2 weeks · Kazeros". */
	label: string;
	at: number;
	/** Imported skill distribution from the same runs, retained across reloads. */
	skillShares?: Record<number, number>;
	skillCooldownUse?: Record<number, number>;
	sample?: { selected: number; source: string; runs: ReplayRun[] };
	replayPersistence?: 'metadata-only';
}

function read(): Record<string, SavedStatValues> {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
}

export const statValues = $state<{ byCharacter: Record<string, SavedStatValues>; loaded: boolean }>({ byCharacter: {}, loaded: false });

export function loadStatValues() {
	if (statValues.loaded || typeof localStorage === 'undefined') return;
	statValues.byCharacter = read();
	statValues.loaded = true;
}

/** Saves (or with null, forgets) a character's values. */
export function setStatValues(characterKey: string, saved: SavedStatValues | null) {
	loadStatValues();
	if (saved) statValues.byCharacter[characterKey] = saved;
	else delete statValues.byCharacter[characterKey];
	try {
		localStorage.setItem(KEY, JSON.stringify(statValues.byCharacter));
	} catch {
		// Hit/buff traces are larger than the scalar estimates. Preserve values, shares and sample metadata
		// when full replay data exceeds storage quota; keep the complete traces in memory for this visit.
		if (saved?.sample) {
			const compact: SavedStatValues = {...saved,replayPersistence:'metadata-only',sample:{...saved.sample,runs:saved.sample.runs.map(r=>({...r,hits:[]}))}};
			try { localStorage.setItem(KEY,JSON.stringify({...statValues.byCharacter,[characterKey]:compact})); } catch { /* storage blocked: memory only */ }
		}
	}
}
