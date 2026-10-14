// Is the gear being simulated the gear the player raids in? Players often keep a higher-CP loadout for gatekeeping
// (e.g. Raid Captain instead of Super Charge) and swap to their real build in raids. Each log records the engravings
// the player fought with, so the loaded loadout is checked against the chosen raid's newest clear.
// Bracelets and other gear aren't in the logs, so only engravings can be checked.

import type { RunSummary } from '$lib/logs/protocol';
import { ENGRAVING_ICONS } from './game-data';
import type { Loadout } from './types';

export const engravingNames = (l: Loadout): string[] =>
	(l.engravings ?? []).map(e => ENGRAVING_ICONS[e.id]?.[1]).filter((n): n is string => !!n);

export interface EngravingCheck {
	/** On the loaded gear but not used in the run. */
	notInRun: string[];
	/** Used in the run but not on the loaded gear (may include ability stone engravings). */
	notInGear: string[];
}

/** null when the run didn't record engravings. The loadout matches when everything on it was used in the run. */
export function checkEngravings(l: Loadout, run: RunSummary): EngravingCheck | null {
	if (!run.engravings.length) return null;
	const gear = engravingNames(l);
	const used = new Set(run.engravings);
	return { notInRun: gear.filter(n => !used.has(n)), notInGear: run.engravings.filter(n => !gear.includes(n)) };
}

export interface LoadoutOption<T> {
	loadout: Loadout;
	/** What switching to it needs (a bible loadout kind or a kept snapshot id); opaque here. */
	ref: T;
	label: string;
}

/** The newest option whose engravings were all used in the run. */
export function raidLoadout<T>(options: LoadoutOption<T>[], run: RunSummary): LoadoutOption<T> | null {
	return options
		.filter(o => checkEngravings(o.loadout, run)?.notInRun.length === 0)
		.sort((a, b) => (b.loadout.lastUpdated ?? 0) - (a.loadout.lastUpdated ?? 0))[0] ?? null;
}
