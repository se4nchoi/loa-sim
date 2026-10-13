import { describe, expect, it } from 'vitest';
import { averageStatValues, splitOf, type ContributionSplit } from './stat-values';

const pair = (pct: number) => ({ damageDoneByStat: 1_000_000, damageDoneByStatPlusValue: 1_000_000 * (1 + pct / 100) });
const split = (name: string, critDamage: number, mainStat: number): ContributionSplit => ({
	name,
	criticalDamageRate1percentDamage: pair(critDamage),
	mainStat1000Damage: pair(mainStat),
	additionalDamage1percentDamage: pair(0.668)
});

describe('meter stat values', () => {
	it('finds the player in a run by name, ignoring case', () => {
		const misc = { contributionSplits: [split('Piami', 0.2, 0.05), split('Soulshan', 0.363, 0.053)] };
		expect(splitOf(misc, 'soulshan')?.name).toBe('Soulshan');
		expect(splitOf(misc, 'Nobody')).toBeNull();
		expect(splitOf(null, 'Soulshan')).toBeNull();
	});

	it('averages per run and skips runs the meter left empty', () => {
		const empty: ContributionSplit = { name: 'Soulshan', criticalDamageRate1percentDamage: { damageDoneByStat: 0, damageDoneByStatPlusValue: 0 } };
		const v = averageStatValues([split('Soulshan', 0.3, 0.05), split('Soulshan', 0.4, 0.06), empty, null])!;
		expect(v.runs).toBe(2);
		expect(v.critDamage).toBeCloseTo(0.35, 9);
		expect(v.mainStat).toBeCloseTo(0.055, 9);
		expect(v.additionalDamage).toBeCloseTo(0.668, 9);
		// A field the meter didn't save counts as no gain.
		expect(v.weaponPower).toBe(0);
	});

	it('is null when no run has values', () => {
		expect(averageStatValues([null, { name: 'Soulshan' }])).toBeNull();
	});
	it('averages missing fields over their actual samples instead of treating them as zero', () => {
		const a = split('Soulshan',0.3,0.05);
		const b = split('Soulshan',0.4,0.06);
		a.weaponPower1000Damage = pair(0.16);
		const v = averageStatValues([a,b])!;
		expect(v.weaponPower).toBeCloseTo(0.16,9);
		expect(v.statSamples?.weaponPower).toBe(1);
		expect(v.statRanges?.critDamage.min).toBeCloseTo(0.3,9);
		expect(v.statRanges?.critDamage.max).toBeCloseTo(0.4,9);
	});
});
