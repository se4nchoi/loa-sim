import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultCraftSave, loadCraftSave, saveCraftSave } from './storage';

afterEach(() => vi.unstubAllGlobals());

describe('crafting browser storage', () => {
	it('keeps market prices, roster inventory, discounts and selected recipe across reloads', () => {
		let saved: string | null = null;
		vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } });
		const craft = defaultCraftSave();
		craft.recipeId = '6861012:logging';
		craft.settings.costReduction = 12;
		craft.favorites = ['6861012:logging', '6861013:excavating'];
		craft.favoritesOnly = true;
		craft.manor.structures[0] = 'glass-sheep';
		craft.manor.owned = ['glass-sheep'];
		craft.markets.NA.prices['6861012'] = 100;
		craft.markets.CE.prices['6861012'] = 120;
		craft.markets.CE.owned['6882301'] = 400;
		saveCraftSave(craft);
		expect(loadCraftSave()).toEqual(craft);
	});
	it('preserves the previously selected region inventory when removing the region selector', () => {
		const old = defaultCraftSave();
		old.region = 'CE';
		old.markets.CE.prices['6861013'] = 150;
		vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(old) });
		const migrated = loadCraftSave();
		expect(migrated.region).toBe('NA');
		expect(migrated.markets.NA.prices['6861013']).toBe(150);
	});
	it('rejects malformed saved input without turning missing prices into zero', () => {
		vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ region: 'KR', recipeId: 'invalid', settings: { crafts: -3, costReduction: 900 }, markets: { NA: { prices: { valid: 0, bad: '20', negative: -1 }, owned: { valid: 12.8 } } } }) });
		const craft = loadCraftSave();
		expect(craft.region).toBe('NA');
		expect(craft.recipeId).toBe(defaultCraftSave().recipeId);
		expect(craft.settings.crafts).toBe(1);
		expect(craft.settings.costReduction).toBe(100);
		expect(craft.markets.NA.prices).toEqual({ valid: 0 });
		expect(craft.markets.NA.owned).toEqual({ valid: 12 });
	});
	it('normalizes manor slots and rejects equipment in the wrong slot type', () => {
		const saved = defaultCraftSave();
		saved.manor.structures = ['glass-sheep', 'glass-sheep', 'payla-vern'];
		saved.manor.outfits = ['card-flipping', 'payla-vern', 'payla-vern'];
		saved.manor.owned = ['glass-sheep', 'glass-sheep', 'unknown'];
		vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(saved) });
		const loaded = loadCraftSave().manor;
		expect(loaded.structures).toEqual(['glass-sheep', '', '']);
		expect(loaded.outfits).toEqual(['', 'payla-vern', '']);
		expect(loaded.owned).toEqual(['glass-sheep']);
	});
	it('restores at most one outfit for each NPC', () => {
		const saved = defaultCraftSave();
		saved.manor.outfits = ['nineveh-cute', 'nineveh-sunshine', 'urr-summer'];
		vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(saved) });
		expect(loadCraftSave().manor.outfits).toEqual(['nineveh-cute', '', 'urr-summer']);
	});
	it('ignores malformed manor arrays and non-numeric bonuses', () => {
		vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ manor: { slots: '4', structures: { length: 999999 }, outfits: null, baseCost: '20', baseEnergy: -5 } }) });
		const loaded = loadCraftSave().manor;
		expect(loaded.slots).toBe(3);
		expect(loaded.structures).toEqual(['', '', '']);
		expect(loaded.outfits).toEqual(['', '', '']);
		expect(loaded.baseCost).toBe(0);
		expect(loaded.baseEnergy).toBe(0);
	});
	it('reports a failed write and recovers when storage becomes available', () => {
		let blocked = true;
		vi.stubGlobal('localStorage', { setItem: () => { if (blocked) throw new Error('quota'); } });
		expect(saveCraftSave(defaultCraftSave())).toBe(false);
		blocked = false;
		expect(saveCraftSave(defaultCraftSave())).toBe(true);
	});
	it('works when localStorage is unavailable', () => {
		vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
		expect(loadCraftSave()).toEqual(defaultCraftSave());
		expect(() => saveCraftSave(defaultCraftSave())).not.toThrow();
	});
});
