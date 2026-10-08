// Class emblems (copied from lostark.bible's /i/classes/<id>.png into static/classes). bible names classes by
// internal id ("soul_eater", sometimes spelled without underscores elsewhere); the emblem files use the game's
// numeric class id.

import { classKeyFromName } from './class-names';

const CLASS_NUMBERS: Record<string, number> = {
	warrior: 101, berserker: 102, destroyer: 103, warlord: 104, holyknight: 105,
	warriorfemale: 111, berserkerfemale: 112, holyknightfemale: 113,
	magician: 201, arcana: 202, summoner: 203, bard: 204, elementalmaster: 205,
	fighter: 301, battlemaster: 302, infighter: 303, forcemaster: 304, lancemaster: 305,
	fightermale: 311, battlemastermale: 312, infightermale: 313,
	delain: 401, blade: 402, demonic: 403, reaper: 404, souleater: 405,
	hunter: 501, hawkeye: 502, devilhunter: 503, blaster: 504, scouter: 505,
	hunterfemale: 511, devilhunterfemale: 512,
	specialist: 601, yinyangshi: 602, weatherartist: 603, alchemist: 604,
	specialistmale: 611, dimensionmaster: 612,
	dragonhuman: 701, dragonknight: 702
};

/** Emblem URL for a bible class id, the game's numeric id, or an NA class name; undefined when unknown. */
export function classIconUrl(classId: string | number | undefined): string | undefined {
	if (classId === undefined || classId === '') return undefined;
	const key = String(classId).replaceAll('_', '').toLowerCase();
	const n = /^\d+$/.test(key) ? Number(key) : (CLASS_NUMBERS[key] ?? CLASS_NUMBERS[classKeyFromName(String(classId)) ?? '']);
	return n ? `/classes/${n}.png` : undefined;
}
