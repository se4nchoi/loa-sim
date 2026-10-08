import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ dev: true }));
const { parseRosters } = await import('./bible-oauth');

describe('parseRosters', () => {
	it('reads rosters with region and characters, highest item level first', () => {
		const chars = parseRosters([
			{ region: 'NA', world: 'Inanna', characters: [
				{ name: 'soulshan', class: 'soul_eater', ilvl: 1784.17, lastUpdate: '2026-10-07T12:00:00Z' },
				{ name: 'Brushann', class: 'yinyangshi', ilvl: 1750.83, lastUpdate: 1791400000 }
			] },
			{ region: 'ce', characters: [{ name: 'Euro', ilvl: 1790 }] }
		]);
		expect(chars.map((c) => `${c.region}/${c.name}`)).toEqual(['CE/Euro', 'NA/Soulshan', 'NA/Brushann']);
		expect(chars[1]).toMatchObject({ classId: 'soul_eater', ilvl: 1784.17, lastUpdate: Date.parse('2026-10-07T12:00:00Z') });
		expect(chars[2].lastUpdate).toBe(1791400000 * 1000); // seconds → ms
	});

	it('accepts { rosters: [...] } and per-character regions; skips unknown regions and nameless entries', () => {
		const chars = parseRosters({ rosters: [{ characters: [{ name: 'A', region: 'NA' }, { name: 'B', region: 'KR' }, { region: 'NA' }] }] });
		expect(chars.map((c) => c.name)).toEqual(['A']);
	});

	it('copes with an empty or odd response', () => {
		expect(parseRosters(null)).toEqual([]);
		expect(parseRosters({})).toEqual([]);
	});
});
