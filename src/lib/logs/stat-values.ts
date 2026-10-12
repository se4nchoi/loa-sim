// LOA Logs saves, per player per fight, what one more of a stat would have added to their damage
// (`encounter.misc.contributionSplits[]`, each `{ damageDoneByStat, damageDoneByStatPlusValue }`), worked out from the
// player's inspected stats. These average them over runs, in percent of the player's damage.

import type { StatValues } from './protocol';

type Pair = { damageDoneByStat?: number; damageDoneByStatPlusValue?: number };
/** One player's entry in `contributionSplits` (only the fields used here). */
export type ContributionSplit = { name?: string } & Partial<Record<(typeof FIELDS)[keyof typeof FIELDS], Pair>>;

const FIELDS = {
	additionalDamage: 'additionalDamage1percentDamage',
	critRate: 'criticalHitRate1percentDamage',
	critDamage: 'criticalDamageRate1percentDamage',
	evoDamage: 'evoDamage1percentDamage',
	attackPowerPct: 'attackPower1percentDamage',
	weaponPowerPct: 'weaponPower1percentDamage',
	mainStat: 'mainStat1000Damage',
	weaponPower: 'weaponPower1000Damage',
	attackPower: 'attackPower1000Damage'
} as const;
type Field = keyof typeof FIELDS;

/** % gain of one pair; null when the meter didn't compute it (older logs, low performance mode). */
const gain = (p: Pair | undefined) =>
	p && typeof p.damageDoneByStat === 'number' && p.damageDoneByStat > 0 && typeof p.damageDoneByStatPlusValue === 'number'
		? (p.damageDoneByStatPlusValue / p.damageDoneByStat - 1) * 100
		: null;

/** The player's split in one run's `misc`, matched by name (case-insensitive). */
export function splitOf(misc: unknown, player: string): ContributionSplit | null {
	const splits = (misc as { contributionSplits?: ContributionSplit[] } | null)?.contributionSplits;
	return splits?.find((s) => s.name?.toLowerCase() === player.toLowerCase()) ?? null;
}

/** Average per run over the runs that have the values; null when none do. */
export function averageStatValues(splits: (ContributionSplit | null)[]): StatValues | null {
	const sums = Object.fromEntries(Object.keys(FIELDS).map((k) => [k, 0])) as Record<Field, number>;
	let runs = 0;
	for (const s of splits) {
		// A run counts when the meter computed its values (crit damage is always present when any are).
		if (!s || gain(s[FIELDS.critDamage]) === null) continue;
		runs++;
		for (const k of Object.keys(FIELDS) as Field[]) sums[k] += gain(s[FIELDS[k]]) ?? 0;
	}
	if (!runs) return null;
	return { runs, ...(Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / runs])) as Record<Field, number>) };
}
