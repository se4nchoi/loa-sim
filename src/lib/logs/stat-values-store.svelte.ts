// The meter's per-stat values a player loaded from their LOA Logs, kept per character in this browser, so Next
// Upgrades can show DPS next to CP. Loaded with the damage shares (Gems card → Load shares from LOA Logs).

import type { StatValues } from './protocol';

const KEY = 'loa-sim:stat-values';

export interface SavedStatValues {
	values: StatValues;
	/** Which runs they came from, e.g. "Last 2 weeks · Kazeros". */
	label: string;
	at: number;
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
		// storage full or blocked: keep them for this visit only
	}
}
