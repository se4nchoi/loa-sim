// Paradise orb: the one piece of Paradise gear that counts outside Paradise. bible's battle point part 33 (dealers)
// carries the orb id and the Paradise power of the orb's season ("paradisePoints"); its value is
//   k × (paradise power / 1,000,000 + 2.5)
// with k set by the orb (read back from bible's own value, so any orb works). Supports score their orb as part 34, a
// flat 130 whatever the Paradise power, so for them there's nothing to simulate.
// Only the snapshot's orb is simulated: power doesn't carry across seasons, and how Paradise gear adds up to power
// isn't published, so the player just types the power they want to try.

import { PartType } from './cp';
import type { Loadout } from './types';

/** Names and confirmed icons of the orbs we've seen (bible gives only the id). */
const ORBS: Record<number, { name: string; icon?: string }> = {
	657820001: { name: 'Season 3 orb' },
	657830001: { name: 'Orb of the Spreading Mist' },
	657830002: { name: 'Orb of the Blazing Sun', icon: 'acc_338' }
};

export interface SimParadise {
	orb: number;
	/** Paradise power of the orb's season (what the orb scales with). */
	power: number;
	/** Battle points per million power for this orb, read back from bible's value. */
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
	return { orb, power, k, flat };
}

export const orbName = (orb: number) => ORBS[orb]?.name ?? 'Orb of Paradise';
export const orbIcon = (orb: number) => ORBS[orb]?.icon;

/** Paradise power with thousands separators, e.g. 30,014,791. */
export const formatPower = (v: number) => Math.round(v).toLocaleString('en-US');

/** A typed Paradise power ("30,014,791", "30014791", " 31.5m ") as a number, or null if it isn't one. */
export function parsePower(text: string): number | null {
	const t = text.trim().toLowerCase().replace(/,/g, '');
	const m = t.match(/^(\d+(?:\.\d+)?)\s*(m)?$/);
	if (!m) return null;
	return Math.round(Number(m[1]) * (m[2] ? 1e6 : 1));
}
