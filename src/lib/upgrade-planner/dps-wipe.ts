// A failed pull: how it ended, and only then what damage would have done. A wipe is mostly mechanics or survival, so
// the logs are read for what they can tell apart:
//   - other pulls of the same gate that ended near the same boss HP: a mechanic at that HP, not damage;
//   - other pulls that ended near the same time with the boss at different HP: a timer (enrage), so a DPS check;
// The damage numbers (boss HP left over the damage dealt; this player's part by their share of the party's damage, adds
// included) are only for enrage wipes: DPS is what an enrage asks for; other wipes need something else.
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

export interface WipeStory extends WipeGap {
	/** Fight length, seconds. */
	endedAt: number;
	/**
	 * What the gate's other pulls suggest: 'hp' = several ended near this boss HP (a mechanic), 'time' = several ended
	 * near this time at different HP (a timer: a DPS check), null = no pattern.
	 */
	pattern: { kind: 'hp' | 'time'; count: number; at: number } | null;
	/** Players down at the end. */
	dead: { count: number; of: number } | null;
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

const HP_NEAR = 2.5; // percent points of boss HP
const TIME_NEAR = 10; // seconds
const HP_APART = 10; // a timer's pulls end at boss HP this far apart or more

/**
 * How a failed pull ended, read against the same gate's other failed pulls (`gate`, this one may be among them). A clear of
 * the gate that lasted longer (`longestClear`, seconds) rules a timer out: the enrage can't come before a clear's end.
 */
export function wipeStory(run: RunSummary, gate: RunSummary[], longestClear = 0): WipeStory | null {
	const gap = wipeGap(run);
	if (!gap) return null;
	const endedAt = run.duration / 1000;
	const others = gate.filter((r) => r !== run && r.id !== run.id).map((r) => ({ r, g: wipeGap(r) })).filter((x) => x.g);
	const nearHp = others.filter((x) => Math.abs(x.g!.hpLeftPct - gap.hpLeftPct) <= HP_NEAR);
	const nearTime = others.filter((x) => Math.abs(x.r.duration / 1000 - endedAt) <= TIME_NEAR);
	const timeHps = [gap.hpLeftPct, ...nearTime.map((x) => x.g!.hpLeftPct)];
	const timer = nearTime.length >= 2 && Math.max(...timeHps) - Math.min(...timeHps) >= HP_APART && longestClear < endedAt - TIME_NEAR;
	const pattern = timer ? { kind: 'time' as const, count: nearTime.length + 1, at: endedAt }
		: nearHp.length >= 2 ? { kind: 'hp' as const, count: nearHp.length + 1, at: gap.hpLeftPct } : null;
	return { ...gap, endedAt, pattern, dead: run.dead ?? null };
}
