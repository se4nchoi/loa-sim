// DPS estimate for gem changes, from per-skill damage shares.
//
// Combat Power treats every gem the same (each adds base attack). Real damage depends on which skill a gem
// sits on: a damage gem multiplies that skill's damage, a cooldown gem lets it be cast more often. Given the
// share of total damage each skill does (e.g. from a log), the estimate is
//   Σ share_skill × (damage_after / damage_before × casts_ratio − 1)
// with damage = Π(1 + damage%) over the skill's gems. For casts, a skill spends a share u of the fight on
// cooldown (its "cooldown use", from LOA Logs' time-available) and the rest ready but waiting on the rotation.
// Keeping that waiting time per cast, scaling the cooldown by k = Π(1 − cd%)_after / Π(1 − cd%)_before gives
//   casts_ratio = 1 / (1 − u + u·k)
// u = 1 (always cast off cooldown) is the optimistic 1 / k; u = 0 means cooldown gems add nothing.

import { GEM_EFFECTS } from './game-data';
import type { GemPart, SimGem } from './simulate';

const effect = (gem: SimGem, tier: 'T4' | 'T3') => (GEM_EFFECTS[tier][gem.kind][gem.level - 1] ?? 0) / 1e4;

/** Per skill: damage multiplier and the share of its cooldown that remains (Π(1 − cd%)). */
function skillGems(gems: SimGem[], parts: GemPart[]): Map<number, { damage: number; cooldown: number }> {
	const out = new Map<number, { damage: number; cooldown: number }>();
	gems.forEach((g, i) => {
		const tier = g.tier ?? parts[i]?.tier;
		if (g.skill === null || !tier) return;
		const e = effect(g, tier);
		const s = out.get(g.skill) ?? { damage: 1, cooldown: 1 };
		if (g.kind === 'damage') s.damage *= 1 + e;
		else s.cooldown *= 1 - e;
		out.set(g.skill, s);
	});
	return out;
}

/**
 * Estimated DPS change in percent, or null when no damage shares were entered. `cooldownUse` is per skill, in
 * percent of the fight spent on cooldown; skills without one count as always cast off cooldown (100%).
 */
export function gemDpsGainPct(
	before: SimGem[],
	after: SimGem[],
	parts: GemPart[],
	shares: Record<number, number>,
	cooldownUse: Record<number, number> = {}
): number | null {
	const entered = Object.entries(shares).filter(([, v]) => Number(v) > 0);
	if (!entered.length) return null;
	const g0 = skillGems(before, parts);
	const g1 = skillGems(after, parts);
	const none = { damage: 1, cooldown: 1 };
	let gain = 0;
	for (const [skill, share] of entered) {
		const id = Number(skill);
		const [a, b] = [g0.get(id) ?? none, g1.get(id) ?? none];
		const u = Math.max(0, Math.min(1, (cooldownUse[id] ?? 100) / 100));
		const casts = 1 / (1 - u + (u * b.cooldown) / a.cooldown);
		gain += (Number(share) / 100) * ((b.damage / a.damage) * casts - 1);
	}
	return gain * 100;
}
