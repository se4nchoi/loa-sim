import { describe, expect, it } from 'vitest';
import { bibleDataUrl, parseCharacterInput, parsePastedData } from './bible-data';

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
