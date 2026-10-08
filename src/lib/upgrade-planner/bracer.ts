import type { Loadout } from './types';

export type BracerGrade = 'epic' | 'legendary' | 'relic' | 'ancient';
export interface SimBracer { honing: number; grade: BracerGrade }
export const BRACER_GRADES: BracerGrade[] = ['epic', 'legendary', 'relic', 'ancient'];
export const BRACER_LIMITS = { epic: [0, 10], legendary: [10, 15], relic: [15, 20], ancient: [20, 25] } as const;

/** One legal step: first acquisition, honing, then a limit break at the grade's cap. */
export function nextBracer(b: SimBracer | null): SimBracer | null {
	if (!b) return { grade: 'epic', honing: 0 };
	const [min, max] = BRACER_LIMITS[b.grade];
	if (!Number.isInteger(b.honing) || b.honing < min || b.honing > max) return null;
	if (b.honing < max) return { ...b, honing: b.honing + 1 };
	const grade = BRACER_GRADES[BRACER_GRADES.indexOf(b.grade) + 1];
	return grade ? { grade, honing: b.honing } : null;
}

// KR live values, published in LOPEC's enhancement calculator (2026-10-08):
// https://www.lopec.kr/tool/enhancement
// Grade progression: https://lostark.game.onstove.com/News/Notice/Views/13508
// Rows: main stat, vitality, Weapon Power, flat basic Attack Power. Grade adds 0/1/2/3% basic AP.
const STATS = [
	[10500,900,3500,0], [10500,1440,5350,0], [16500,1440,5350,0],
	[16500,1982,7210,0], [22530,1982,7210,0], [22530,1982,7210,850],
	[22530,2526,9077,850], [28608,2526,9077,850], [28608,3072,10969,850],
	[34746,3072,10969,850], [34746,3072,10969,2030], [34746,3621,12873,2030],
	[40962,3621,12873,2030], [40962,4173,14817,2030], [47268,4173,14817,2030],
	[47268,4173,14817,3690], [47268,4728,16778,3690], [53682,4728,16778,3690],
	[53682,5286,18794,3690], [60216,5286,18794,3690], [60216,5286,18794,5980],
	[60216,5848,20832,5980], [66888,5848,20832,5980], [66888,6414,22940,5980],
	[73710,6414,22940,5980], [73710,6414,22940,9050]
] as const;

export function bracerStats(b: SimBracer | null) {
	if (!b) return { mainStat: 0, vitality: 0, weaponPower: 0, attackFlat: 0, attackPercent: 0 };
	const [min, max] = BRACER_LIMITS[b.grade];
	const level = Number.isFinite(b.honing) ? Math.min(max, Math.max(min, Math.trunc(b.honing))) : min;
	const [mainStat, vitality, weaponPower, attackFlat] = STATS[level];
	return { mainStat, vitality, weaponPower, attackFlat, attackPercent: BRACER_GRADES.indexOf(b.grade) };
}

/** Read only known KR bracer item families; the global import shape awaits release. */
export function readBracer(l: Loadout): SimBracer | null {
	const item = l.items?.find((i) => ['bracer', 'vambrace'].includes(i.slot));
	if (!item || Math.floor(item.id / 10000) % 10 !== 0 || Math.floor(item.id / 1000000) !== 134) return null;
	const grade = BRACER_GRADES[Math.floor(item.id / 100000) % 10 - 3];
	if (!grade || typeof item.data.honing !== 'number') return null;
	const [min, max] = BRACER_LIMITS[grade];
	if (!Number.isInteger(item.data.honing) || item.data.honing < min || item.data.honing > max) return null;
	return { honing: item.data.honing, grade };
}
