// Item and effect icons, served from the official game CDN (the same URLs the KR Open API returns).

import { ENGRAVING_ICONS, ITEMS } from './game-data';
import type { CoreInfo } from './tables';

const CDN = 'https://cdn-lostark.game.onstove.com/efui_iconatlas';

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
