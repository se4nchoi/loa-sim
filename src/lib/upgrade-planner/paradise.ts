// Paradise orb: the one piece of Paradise gear that counts outside Paradise. bible's battle point part 33 (dealers)
// carries the orb id and the Paradise power of the orb's season ("paradisePoints"); its value is
//   k × (paradise power / 1,000,000 + 2.5)
// with k set by the orb: the game's battle point table has it for every orb (PARADISE_ORBS, k = perPower / 100), and
// the snapshot's own orb is read back from bible's value. Supports score their orb as part 34, a flat 130 whatever
// the Paradise power, so for them there's nothing to simulate.
// Power doesn't carry across seasons: each orb scales with its own season's power, so the simulation keeps one power
// per season. bible gives only the snapshot orb's season; the others start at the same number for the player to edit.

import { PartType } from './cp';
import { PARADISE_ORBS } from './game-data';
import type { Loadout } from './types';

const ORB_IDS = Object.keys(PARADISE_ORBS).map(Number);

export interface SimParadise {
	orb: number;
	/** Paradise power per season; an orb scales with its own season's. */
	powers: Record<number, number>;
	/** Battle points per million power for the snapshot's orb, read back from bible's value. */
	k: number;
	/** Support orb: a flat value, not driven by power. */
	flat: boolean;
}

export const orbValue = (k: number, power: number) => k * (power / 1e6 + 2.5);

export function readParadise(l: Loadout): SimParadise | null {
	const part = l.battlePoint.parts.find((p) => p.type === PartType.ParadiseOrb || p.type === PartType.ParadiseOrbDefense);
	if (!part) return null;
	const orb = Number(part.id) || 0;
	const power = Number(part.paradisePoints) || 0;
	const flat = part.type === PartType.ParadiseOrbDefense;
	const k = flat ? 0 : (part.value ?? 0) / (power / 1e6 + 2.5);
	const seasons = [orb, ...ORB_IDS].map((o) => orbSeason(o) ?? 0);
	return { orb, powers: Object.fromEntries(seasons.map((s) => [s, power])), k, flat };
}

/** The Paradise power the current orb scales with (its season's; 0 if none entered). */
export const orbPower = (p: SimParadise) => p.powers[orbSeason(p.orb) ?? 0] ?? 0;

/** k for an orb: the snapshot's read-back value for its own orb, the game table's for others. */
export const orbK = (orb: number, base: SimParadise) => (orb === base.orb ? base.k : (PARADISE_ORBS[orb]?.perPower ?? 0) / 100);

/** Orbs a dealer can switch to: every orb in the game's table (plus the snapshot's, should it be missing), newest season first. */
export const orbChoices = (base: SimParadise) =>
	[...new Set([base.orb, ...ORB_IDS])].sort((a, b) => (orbSeason(b) ?? 0) - (orbSeason(a) ?? 0) || a - b);

/** Orb ids carry the season: 6578 S 000N, with S = season − 1 (65782… is Season 3, 65783… Season 4). */
export const orbSeason = (orb: number): number | null =>
	Math.floor(orb / 1e5) === 6578 ? (Math.floor(orb / 1e4) % 10) + 1 : null;

/** The game's name for an orb; an id the table doesn't have yet (a new season) is named by its season. */
export const orbName = (orb: number) => {
	if (PARADISE_ORBS[orb]) return PARADISE_ORBS[orb].name;
	const season = orbSeason(orb);
	return season ? `Season ${season} orb` : 'Orb of Paradise';
};
export const orbIcon = (orb: number) => PARADISE_ORBS[orb]?.icon;

/** Paradise power with thousands separators, e.g. 30,014,791. */
export const formatPower = (v: number) => Math.round(v).toLocaleString('en-US');

/** A typed Paradise power ("30,014,791", "30014791", " 31.5m ", "35000k") as a number, or null if it isn't one. */
export function parsePower(text: string): number | null {
	const t = text.trim().toLowerCase().replace(/,/g, '');
	const m = t.match(/^(\d+(?:\.\d+)?)\s*([km])?$/);
	if (!m) return null;
	return Math.round(Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1));
}
