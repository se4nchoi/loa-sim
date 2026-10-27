import { ENGRAVING_DAMAGE_STATS } from './damage-context-data';
import type { SimState } from './simulate';

/** Actual stat buckets, not the CP table's flattened engraving damage. */
export function engravingDamageStats(state: SimState) {
	const totals: {attackPowerPct: number | null; critDamage: number | null; critRate: number | null} = {attackPowerPct: 0, critDamage: 0, critRate: 0};
	for (const [key, engraving] of Object.entries(state.engravings)) {
		const entry = ENGRAVING_DAMAGE_STATS[engraving.as ?? Number(key)]?.[engraving.stone * 20 + engraving.books + 4];
		for (const stat of ['attackPowerPct', 'critDamage', 'critRate'] as const) {
			const value = entry?.[stat];
			if (value === null || value === undefined || !Number.isFinite(value)) totals[stat] = null;
			else if (totals[stat] !== null) totals[stat]! += value;
		}
	}
	return totals;
}
