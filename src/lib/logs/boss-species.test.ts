import { describe, expect, it } from 'vitest';
import { bossDemonSpecies, gateDemonSpecies } from './boss-species';

describe('bracelet target species', () => {
	it('uses game species, not words in the name', () => {
		expect(bossDemonSpecies('Phantom Legion Commander Brelshaza')).toBe('demon');
		expect(bossDemonSpecies('Abyss Lord Kazeros')).toBe('archdemon');
		expect(bossDemonSpecies('Death Incarnate Kazeros')).toBe('other');
		expect(gateDemonSpecies('Witch of Agony, Serca')).toBe('other');
		expect(gateDemonSpecies('Corvus Tul Rak')).toBe('other');
		expect(gateDemonSpecies('Belgardin, Arbiter of Death')).toBe('other');
	});
	it('leaves mixed-phase, incomplete and unknown encounters unresolved', () => {
		for (const boss of ['Death Incarnate Kazeros', 'Archdemon Kazeros', 'Akkan, Lord of Death', 'Abyss Monarch Aegir', 'Prokel', 'Demon Test Boss', '']) {
			expect(gateDemonSpecies(boss)).toBeNull();
		}
		expect(gateDemonSpecies('Abyss Lord Kazeros')).toBe('archdemon');
		expect(gateDemonSpecies('Demon Beast Commander Valtan')).toBe('demon');
	});
});
