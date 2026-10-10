// Paradise orbs: the one piece of Paradise gear that counts outside Paradise. bible's battle point part 33 (dealers)
// carries the orb id and the character's highest Paradise power ("paradisePoints"); its value is
//   k × (paradise power / 1,000,000 + 2.5)
// with k set by the orb (exact on every dealer we've checked). Supports score their orb as part 34, a flat 130 whatever
// the Paradise power, so for them there's nothing to simulate.

import { PartType } from './cp';
import type { Loadout } from './types';

export interface OrbInfo {
	name: string;
	/** Battle points per million Paradise power, on a dealer. */
	k: number;
}

export const ORBS: Record<number, OrbInfo> = {
	657820001: { name: 'Season 3 orb', k: 10 },
	657830001: { name: 'Orb of the Spreading Mist', k: 12 },
	657830002: { name: 'Orb of the Blazing Sun', k: 7.2 }
};

export interface SimParadise {
	orb: number;
	/** Highest Paradise power reached (what the orb scales with). */
	power: number;
	/** Battle points per million power for this character's orb: the table's, else read back from bible's value. */
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
	const value = part.value ?? 0;
	// An orb we haven't seen yet: its k from bible's own number.
	const k = ORBS[orb]?.k ?? (flat ? 0 : value / (power / 1e6 + 2.5));
	return { orb, power, k, flat };
}

export const orbName = (p: SimParadise) => ORBS[p.orb]?.name ?? 'Orb of Paradise';
