import { describe, expect, it } from 'vitest';
import { bibleDataUrl, parseCharacterInput, parsePastedData, pickLoadout } from './bible-data';
import type { Loadout } from './upgrade-planner/types';

describe('parseCharacterInput', () => {
	it('takes a plain name with the chosen region', () => {
		expect(parseCharacterInput('  Soulshan ', 'NA')).toEqual({ region: 'NA', name: 'Soulshan' });
	});

	it('takes a lostark.bible URL and uses its region', () => {
		expect(parseCharacterInput('https://lostark.bible/character/CE/Some%C3%A9name?tab=1', 'NA')).toEqual({
			region: 'CE',
			name: 'Someéname'
		});
		expect(parseCharacterInput('lostark.bible/character/na/Soulshan/__data.json', 'CE')).toEqual({
			region: 'NA',
			name: 'Soulshan'
		});
	});

	it('normalizes capitalization the way the game names characters, accents included', () => {
		expect(parseCharacterInput('sOULSHAN', 'NA')).toEqual({ region: 'NA', name: 'Soulshan' });
		expect(parseCharacterInput('élÁN', 'CE')).toEqual({ region: 'CE', name: 'Élán' });
		expect(parseCharacterInput('https://lostark.bible/character/NA/%C3%AFris', 'CE')).toEqual({ region: 'NA', name: 'Ïris' });
		expect(bibleDataUrl('NA', 'Élán')).toBe('https://lostark.bible/character/NA/%C3%89l%C3%A1n/__data.json?x-sveltekit-invalidated=011');
	});

	it('rejects junk', () => {
		expect(parseCharacterInput('', 'NA')).toBeNull();
		expect(parseCharacterInput('two words', 'NA')).toBeNull();
		expect(parseCharacterInput('https://lostark.bible/character/KR/x', 'NA')).toBeNull();
	});

	it('builds the data link', () => {
		expect(bibleDataUrl('NA', 'Soulshan')).toBe(
			'https://lostark.bible/character/NA/Soulshan/__data.json?x-sveltekit-invalidated=011'
		);
	});
});

describe('parsePastedData', () => {
	// Minimal devalue-flattened body in the shape bible's __data.json uses.
	const body = {
		type: 'data',
		nodes: [
			{ type: 'skip' },
			{ type: 'data', data: [{ header: 1 }, { ilvl: 2 }, 1784.17] },
			{
				type: 'data',
				data: [{ loadouts: 1 }, [2], { type: 3, battlePoint: 4 }, 'ark_passive', { parts: 5, isSupport: 6 }, [], false]
			}
		]
	};

	it('decodes header and the ark passive loadout', () => {
		const d = parsePastedData(JSON.stringify(body), 'Soulshan', 'NA');
		expect(d.header).toEqual({ ilvl: 1784.17 });
		expect(d.loadout).toEqual({ type: 'ark_passive', battlePoint: { parts: [], isSupport: false } });
	});

	it('explains truncated or wrong pastes', () => {
		expect(() => parsePastedData('{"type":"data","nod', 'x', 'NA')).toThrow(/isn't complete/);
		expect(() => parsePastedData('{"hello":1}', 'x', 'NA')).toThrow(/doesn't look like/);
		expect(() => parsePastedData(JSON.stringify({ type: 'data', nodes: [] }), 'x', 'NA')).toThrow(/No character/);
	});
});

const lo = (isSupport: boolean, score: number | null) =>
	({ type: 'ark_passive', classId: 'bard', itemLevel: 1750, battlePoint: { isSupport, parts: [] }, combatPower: score === null ? null : { id: isSupport ? 2 : 1, score } }) as unknown as Loadout;

describe('pickLoadout', () => {
	it('takes the loadout the game scored (a DPS-build support is a dealer)', () => {
		expect(pickLoadout([lo(true, null), lo(false, 4200)])!.battlePoint.isSupport).toBe(false);
		expect(pickLoadout([lo(true, 3300), lo(false, null)])!.battlePoint.isSupport).toBe(true);
	});

	it('prefers the raid snapshot over a chaos dungeon one, then the newest', () => {
		const chaos = { ...lo(false, 3472), classification: 'most_recent_chaos_dungeon', lastUpdated: 2 };
		const raid = { ...lo(false, 5784), classification: 'most_recent_raid', lastUpdated: 1 };
		expect(pickLoadout([chaos, raid])!.combatPower!.score).toBe(5784);
		const older = { ...lo(false, 1000), lastUpdated: 1 };
		const newer = { ...lo(false, 2000), lastUpdated: 2 };
		expect(pickLoadout([older, newer])!.combatPower!.score).toBe(2000);
	});

	it('falls back to the first ark passive loadout', () => {
		expect(pickLoadout([lo(true, null), lo(false, null)])!.battlePoint.isSupport).toBe(true);
		expect(pickLoadout([])).toBeNull();
	});
});
