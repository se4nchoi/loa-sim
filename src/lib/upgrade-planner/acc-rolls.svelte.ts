// Which main-line rolls the accessory ladder offers, picked per character in All Upgrades and remembered per browser.

import { DEFAULT_ACC_ROLLS, type AccRoll } from './accessory-sets';

const KEY = 'loa-sim:acc-rolls';

export const accRolls = $state<{ byCharacter: Record<string, AccRoll[]> }>({ byCharacter: {} });

try {
	const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
	if (saved && typeof saved === 'object') accRolls.byCharacter = saved;
} catch {
	/* no storage (SSR, private mode): defaults */
}

export const rollsFor = (characterKey: string): AccRoll[] => accRolls.byCharacter[characterKey] ?? DEFAULT_ACC_ROLLS;

export function setAccRolls(characterKey: string, rolls: AccRoll[]) {
	accRolls.byCharacter[characterKey] = rolls;
	try {
		localStorage.setItem(KEY, JSON.stringify(accRolls.byCharacter));
	} catch {
		/* not remembered */
	}
}
