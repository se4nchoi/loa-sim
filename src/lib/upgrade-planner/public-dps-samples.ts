import type { SavedStatValues } from '$lib/logs/stat-values-store.svelte';
import type { StatValues } from '$lib/logs/protocol';

/** Manually observed public UI values; rounded, not raw contributionSplits or replay hits.
 * Sources and validation limits: docs/dps-shanzkii-public-clears-2026-10-14.md.
 * Each gate stays separate. Unobserved skill shares are left missing, never normalized away. */
export interface PublicDpsSample {
	id: string;
	label: string;
	dps: number;
	ndps: number;
	values: StatValues;
	skillShares: Record<number, number>;
	skillCooldownUse: Record<number, number>;
}

const values = (attackPowerPct: number, critRate: number, critDamage: number, attackPower: number): StatValues => ({
	runs: 1, additionalDamage: .73, evoDamage: .56, weaponPowerPct: .33,
	mainStat: .06, weaponPower: .18, attackPowerPct, critRate, critDamage, attackPower
});
// Falling Blossoms, Violent Waves, Eye of the Storm, Nebula Crusher, Celestial Force Barrage.
const skills = [47950, 47970, 47270, 47290, 47260];
const bySkill = (numbers: number[]) => Object.fromEntries(skills.map((id, i) => [id, numbers[i]]));

export const SHANZKII_PUBLIC_SAMPLES: PublicDpsSample[] = [
	{ id: 'Nevz2cB', label: 'Cathedral Level 3 · G1', dps: 887.9e6, ndps: 351.3e6,
		values: values(.84, .51, .38, .43), skillShares: bySkill([32.1,15,18.5,16.1,12.4]), skillCooldownUse: bySkill([81,64.5,83.6,88,85.3]) },
	{ id: '6bHvxtb', label: 'Cathedral Level 3 · G2', dps: 979.2e6, ndps: 374.4e6,
		values: values(.84, .53, .38, .43), skillShares: bySkill([34.3,13.8,17.3,17.3,11.7]), skillCooldownUse: bySkill([82.5,63.5,79,89.3,79.4]) },
	{ id: '4iZPbvC', label: 'Kazeros Hard · G1', dps: 558.4e6, ndps: 206.3e6,
		values: values(.85, .14, .37, .42), skillShares: bySkill([29.4,13.3,24,17.8,10]), skillCooldownUse: bySkill([86.2,67.1,76.7,58.5,74.8]) },
	{ id: '91Vm5pv', label: 'Kazeros Hard · G2', dps: 558.4e6, ndps: 233.1e6,
		values: values(.86, .12, .37, .43), skillShares: bySkill([31.2,12.5,22.4,15.1,11.3]), skillCooldownUse: bySkill([83.8,64.7,73.6,85.5,81.1]) }
];

export function publicDpsSample(characterKey: string, id: string, now = Date.now()): SavedStatValues | null {
	if (characterKey.toLowerCase() !== 'na/shanzkii') return null;
	const sample = SHANZKII_PUBLIC_SAMPLES.find(s => s.id === id);
	if (!sample) return null;
	return {
		values: { ...sample.values }, label: `Public log · ${sample.label} · Oct 13, 2026`, at: now,
		skillShares: { ...sample.skillShares }, skillCooldownUse: { ...sample.skillCooldownUse },
		publicLog: { id, url: `https://lostark.bible/logs/${id}`, characterKey: 'na/shanzkii',
			skillCoverage: Object.values(sample.skillShares).reduce((sum, share) => sum + share, 0), dps: sample.dps, ndps: sample.ndps }
	};
}
