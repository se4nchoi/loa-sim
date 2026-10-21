import { changedContext, damageFactor, type DamageContext } from './dps-stat-engine';
import { statDeltasAtLeast } from './dps-stats';
import { baseAttackOf } from './dps-explain';
import type { SimState } from './simulate';
import type { Loadout } from './types';

/** The configured context belongs to baseline; calculate both endpoints against it so gains compound correctly. */
export function configuredPlanGain(loadout: Loadout, baseline: SimState, from: SimState, to: SimState, context: DamageContext) {
	const factor = (s: SimState) => {
		// No skill distribution is configured here, so whole-character gem/Ark Grid gains cannot be inferred.
		if (JSON.stringify(s.gems) !== JSON.stringify(baseline.gems)) return null;
		const change = statDeltasAtLeast(loadout, baseline, s, baseline);
		if (!change || change.unvalued.length) return null;
		const delta = {...change.delta, baseAttackPct: baseAttackOf(loadout, s) - baseAttackOf(loadout, baseline)};
		return damageFactor(changedContext(context, delta));
	};
	const a = factor(from), b = factor(to);
	return a === null || b === null ? null : (b / a - 1) * 100;
}
