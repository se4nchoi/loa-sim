// Item and effect icons, served from the official game CDN (the same URLs the KR Open API returns).

import { ENGRAVING_ICONS, ITEMS } from './game-data';
import type { CoreInfo } from './tables';
import { BRACER_GRADES, type BracerGrade } from './bracer';

const CDN = 'https://cdn-lostark.game.onstove.com/efui_iconatlas';
/** Where the ark passive frame / inherited border overlays live (lostark.bible serves the same files at /i). */
export const FRAME_BASE = '/frames';
/** T4 1675 gear is inherited (succession) gear and gets the blue border. */
export const isInheritedGear = (itemId: number | undefined) => !!itemId && Math.floor(itemId / 1000) === 134621;

/** "SE_Item_01_166" → …/se_item/se_item_01_166.png (the folder is the name without its number suffix). */
export function iconUrl(icon: string | undefined): string | undefined {
	if (!icon) return undefined;
	const name = icon.toLowerCase();
	return `${CDN}/${name.replace(/(_\d+)+$/, '')}/${name}.png`;
}

/** lostark.bible's item grade backgrounds, indexed by grade 0 (normal) … 7 (esther). */
export const GRADE_GRADIENTS = [
	'linear-gradient(135deg, #232323, #575757)',
	'linear-gradient(135deg, #18220b, #304911)',
	'linear-gradient(135deg, #111f2c, #113d5d)',
	'linear-gradient(135deg, #261331, #480d5d)',
	'linear-gradient(135deg, #362003, #9e5f04)',
	'linear-gradient(135deg, #341a09, #a24006)',
	'linear-gradient(135deg, #3d3325, #dcc999)',
	'linear-gradient(135deg, #0c2e2c, #2faba8)'
];

export interface ItemLook {
	icon?: string;
	name?: string;
	grade?: number;
}

export function itemLook(id: number | undefined): ItemLook {
	const entry = id ? ITEMS[id] : undefined;
	return entry ? { icon: iconUrl(entry[0]), name: entry[1], grade: entry[2] } : {};
}

/** T4 gem item id for a kind (1 = Doomfire/damage, 2 = Blazing/cooldown) and level. */
export const t4GemId = (kind: 1 | 2, level: number) => 65030000 + kind * 1000 + level * 10;

const CORE_ICON: Record<string, string> = {
	'order:sun': 'Use_13_96',
	'order:moon': 'Use_13_97',
	'order:star': 'Use_13_98',
	'chaos:sun': 'Use_13_99',
	'chaos:moon': 'Use_13_100',
	'chaos:star': 'Use_13_101'
};
const CORE_GRADE: Record<CoreInfo['grade'], number> = { heroic: 3, legendary: 4, relic: 5, ancient: 6 };

export const coreLook = (info: CoreInfo): ItemLook => ({
	icon: iconUrl(CORE_ICON[`${info.attr}:${info.shape}`]),
	grade: CORE_GRADE[info.grade]
});

export const engravingIcon = (id: number) => iconUrl(ENGRAVING_ICONS[id]?.[0]);

// KR bracer art is grouped by base class, with eleven icons per grade.
// Item IDs / icon names: https://lostark.inven.co.kr/dataninfo/item/?datagroup=etc&itemclass2=10206
const BRACER_CLASS_ICON: Record<string, number> = Object.fromEntries([
	[['berserker', 'destroyer', 'warlord', 'holyknight'], 1],
	[['berserkerfemale', 'holyknightfemale'], 2],
	[['bard', 'summoner', 'arcana', 'elementalmaster'], 3],
	[['battlemaster', 'infighter', 'forcemaster', 'lancemaster'], 4],
	[['battlemastermale', 'infightermale'], 5],
	[['devilhunter', 'blaster', 'hawkeye', 'scouter'], 6],
	[['blade', 'demonic', 'reaper', 'souleater'], 7],
	[['devilhunterfemale'], 8],
	[['yinyangshi', 'weatherartist', 'alchemist'], 9],
	[['dimensionmaster'], 10],
	[['dragonknight'], 11]
].flatMap(([classes, offset]) => (classes as string[]).map((id) => [id, offset as number])));

export function bracerLook(classId: string, grade: BracerGrade): ItemLook {
	const offset = BRACER_CLASS_ICON[classId.replaceAll('_', '').toLowerCase()] ?? 1;
	const index = BRACER_GRADES.indexOf(grade);
	return { icon: iconUrl(`bracer_${offset + 11 * index}`), grade: index + 3, name: `${grade[0].toUpperCase() + grade.slice(1)} Bracer` };
}
