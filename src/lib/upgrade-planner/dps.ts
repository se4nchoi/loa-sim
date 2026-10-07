// DPS estimate for gem changes, from per-skill damage shares.
//
// Combat Power treats every gem the same (each adds base attack). Real damage depends on which skill a gem
// sits on: a damage gem multiplies that skill's damage, a cooldown gem lets it be cast more often. Given the
// share of total damage each skill does (e.g. from a log), the estimate is
//   Σ share_skill × (factor_after / factor_before − 1)
// with factor = Π(1 + damage%) × Π(1 / (1 − cooldown%)) over the gems on that skill. Cooldown is the
// optimistic case: it assumes every cooldown saved turns into casts.

import { GEM_EFFECTS } from './game-data';
import type { GemPart, SimGem } from './simulate';

const effect = (gem: SimGem, tier: 'T4' | 'T3') => (GEM_EFFECTS[tier][gem.kind][gem.level - 1] ?? 0) / 1e4;

function skillFactors(gems: SimGem[], parts: GemPart[]): Map<number, number> {
	const out = new Map<number, number>();
	gems.forEach((g, i) => {
		const tier = parts[i]?.tier;
		if (g.skill === null || !tier) return;
		const e = effect(g, tier);
		const f = g.kind === 'damage' ? 1 + e : 1 / (1 - e);
		out.set(g.skill, (out.get(g.skill) ?? 1) * f);
	});
	return out;
}

/** Estimated DPS change in percent, or null when no damage shares were entered. */
export function gemDpsGainPct(
	before: SimGem[],
	after: SimGem[],
	parts: GemPart[],
	shares: Record<number, number>
): number | null {
	const entered = Object.entries(shares).filter(([, v]) => Number(v) > 0);
	if (!entered.length) return null;
	const f0 = skillFactors(before, parts);
	const f1 = skillFactors(after, parts);
	let gain = 0;
	for (const [skill, share] of entered) {
		const id = Number(skill);
		gain += (Number(share) / 100) * ((f1.get(id) ?? 1) / (f0.get(id) ?? 1) - 1);
	}
	return gain * 100;
}
