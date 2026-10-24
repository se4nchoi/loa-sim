// A failed pull's distance from a kill: the boss HP left when the party wiped, and how much more damage would have
// taken it, from the party or from this player alone. Damage to the boss is taken in proportion to each player's total
// damage in the fight (adds and the boss alike); a wipe is often a mechanic, not damage, so this is "what DPS alone
// would have needed", not why the pull failed.
import type { RunSummary } from '$lib/logs/protocol';

export interface WipeGap {
	/** Boss HP left, percent of its max. */
	hpLeftPct: number;
	/** More damage the whole party needed to kill it in the same time, percent. */
	partyPct: number;
	/** More damage this player alone needed, percent of their own damage; null without the party's damage. */
	youPct: number | null;
	/** This player's share of the party's damage, percent. */
	sharePct: number | null;
}

export function wipeGap(run: RunSummary): WipeGap | null {
	const hp = run.bossHp;
	if (run.cleared || !hp || !(hp.max > 0) || !(hp.left > 0) || hp.left >= hp.max) return null;
	const dealt = hp.max - hp.left;
	const share = run.partyDamage && run.partyDamage > 0 ? Math.min(1, run.damage / run.partyDamage) : null;
	return {
		hpLeftPct: (hp.left / hp.max) * 100,
		partyPct: (hp.left / dealt) * 100,
		youPct: share ? (hp.left / (share * dealt)) * 100 : null,
		sharePct: share !== null ? share * 100 : null
	};
}
