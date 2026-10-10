import { describe, expect, it, vi } from 'vitest';
import { bookCost, byGold, clearUpgradePrices, costsForCharacter, loadGold, restoreUpgradePrices, setGoldCost, formatGold, gold, goldPerPct, manualGoldCost, missingPriceCount, parseGold, parseOwned } from './gold-costs.svelte';
import type { Upgrade } from './upgrades';

const up = (key: string, gainPct: number) => ({ key, gainPct, category: 'gem', title: key, detail: '', count: 1, approximate: false }) as Upgrade;

describe('gold costs', () => {
	it('persists skin prices per character, with scoped clear and undo and no shared skin fallback', () => {
		const storage = new Map<string, string>();
		vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
		const wasLoaded = gold.loaded;
		gold.costs = { 'skin:head:2': 999 };
		try {
			setGoldCost('skin:head:2', 100, 'na:soulshan');
			setGoldCost('skin:head:2', 200, 'na:shanzkii');
			setGoldCost('gem:T4:9', 500);
			gold.costs = {};
			gold.loaded = false;
			loadGold();
			expect(costsForCharacter('na:soulshan')).toEqual({ 'skin:head:2': 100, 'gem:T4:9': 500 });
			expect(costsForCharacter('na:shanzkii')['skin:head:2']).toBe(200);
			expect(costsForCharacter('ce:soulshan')['skin:head:2']).toBeUndefined();
			const cleared = clearUpgradePrices('skin', undefined, 'na:soulshan');
			expect(costsForCharacter('na:soulshan')['skin:head:2']).toBeUndefined();
			expect(costsForCharacter('na:shanzkii')['skin:head:2']).toBe(200);
			restoreUpgradePrices(cleared);
			expect(costsForCharacter('na:soulshan')['skin:head:2']).toBe(100);
			setGoldCost('skin:head:2', null, 'na:soulshan');
			expect(costsForCharacter('na:soulshan')['skin:head:2']).toBeUndefined();
		} finally { gold.costs = {}; gold.loaded = wasLoaded; vi.unstubAllGlobals(); }
	});
	it('undo restores cleared quotes and books while preserving newly entered prices', () => {
		gold.costs = { 'engraving:1254:books:20': 600, 'gem:T4:9': 500 };
		gold.bookPrices = { 1254: 1000, 1299: 2000 };
		try {
			const cleared = clearUpgradePrices('engraving');
			gold.bookPrices[1254] = 1500;
			restoreUpgradePrices(cleared);
			expect(gold.costs).toEqual({ 'engraving:1254:books:20': 600, 'gem:T4:9': 500 });
			expect(gold.bookPrices).toEqual({ 1254: 1500, 1299: 2000 });
			const gems = clearUpgradePrices('gem');
			gold.costs['gem:T4:9'] = 700;
			restoreUpgradePrices(gems);
			expect(gold.costs['gem:T4:9']).toBe(700);
		} finally { gold.costs = {}; gold.bookPrices = {}; }
	});
	it('clears all quotes in the requested section or accessory family without changing other prices', () => {
		gold.costs = { 'accset:ear1:atk_pct.high': 100, 'accset:ear2:atk_pct.mid': 200, 'accset:neck:add_dmg.high': 300, 'gem:T4:9': 500, 'engraving:1254:books:20': 600 };
		setGoldCost('skin:head:2', 400);
		gold.bookPrices = { 1254: 1000, 1299: 2000 };
		try {
			clearUpgradePrices('accessory', 'ear');
			expect(Object.keys(gold.costs).filter((k) => k.startsWith('accset:'))).toEqual(['accset:neck:add_dmg.high']);
			clearUpgradePrices('skin');
			expect(costsForCharacter('')['skin:head:2']).toBeUndefined();
			clearUpgradePrices('engraving');
			expect(gold.bookPrices).toEqual({});
			expect(gold.costs['engraving:1254:books:20']).toBeUndefined();
			expect(gold.costs['gem:T4:9']).toBe(500);
			clearUpgradePrices('accessory');
			expect(gold.costs).toEqual({ 'gem:T4:9': 500 });
		} finally { gold.costs = {}; gold.bookPrices = {}; }
	});
	it('counts shared missing accessory quotes once and excludes RNG rows and zero-priced upgrades', () => {
		const ear1 = { ...up('accset:ear1:atk_pct.high,weapon_pct.mid', 1), category: 'accessory' as const };
		const ear2 = { ...ear1, key: 'accset:ear2:weapon_pct.mid,atk_pct.high' };
		const skin = { ...up('skin:head:2', 0.4), category: 'skin' as const };
		const core = { ...up('core:1:20', 1), category: 'core' as const };
		expect(missingPriceCount([ear1, ear2, skin, core], {})).toBe(2);
		expect(missingPriceCount([ear1, ear2, skin, core], { [ear1.key]: 5000, [ear2.key]: 5000, [skin.key]: 0 })).toBe(0);
	});
	it('shares accessory prices across display line order without mixing different rolls', () => {
		const u = { ...up('accset:ear1:atk_pct.high,weapon_pct.mid', 1), category: 'accessory' as const };
		const prices = { 'accset:ear1:weapon_pct.mid,atk_pct.high': 50000 };
		expect(manualGoldCost(u, prices)).toBe(50000);
		expect(goldPerPct(u, prices)).toBe(50000);
		expect(manualGoldCost({ ...u, key: 'accset:ear1:atk_pct.mid,weapon_pct.high' }, prices)).toBeUndefined();
	});
	it('ignores saved manual equipment honing totals while preserving other upgrade inputs', () => {
		const gear = { ...up('honing:weapon:25', 1), category: 'honing' as const };
		const bracer = { ...gear, key: 'bracer:epic:1' };
		const advanced = { ...gear, key: 'advanced:head:20' };
		const gem = up('gem:T4:9', 0.5);
		const costs = { [gear.key]: 123, [bracer.key]: 456, [advanced.key]: 789, [gem.key]: 100000 };
		expect(manualGoldCost(gear, costs)).toBeUndefined();
		expect(manualGoldCost(bracer, costs)).toBeUndefined();
		expect(manualGoldCost(advanced, costs)).toBeUndefined();
		expect(manualGoldCost(gem, costs)).toBe(100000);
	});
	it('excludes Ark Grid suggestions from gold efficiency even with old saved prices', () => {
		const core = { ...up('core:1:20', 1), category: 'core' as const };
		const astrogem = { ...up('astrogem:2001', 0.5), category: 'astrogem' as const };
		const gem = up('gem:4:9', 0.25);
		const costs = { [core.key]: 100, [astrogem.key]: 100, [gem.key]: 10000 };
		expect(goldPerPct(core, costs)).toBeNull();
		expect(goldPerPct(astrogem, costs)).toBeNull();
		expect(byGold([core, astrogem, gem], costs)).toEqual([gem]);
	});
	it('reads gold the way players type it', () => {
		expect(parseGold('45k')).toBe(45000);
		expect(parseGold('1.2m')).toBe(1200000);
		expect(parseGold('5.5m')).toBe(5500000);
		expect(parseGold('5.5 million')).toBe(5500000);
		expect(parseGold('5.5mil')).toBe(5500000);
		expect(parseGold('45 thousand')).toBe(45000);
		expect(parseGold('45k gold')).toBe(45000);
		expect(parseGold('45000g')).toBe(45000);
		expect(parseGold('5.5 bananas')).toBeNull();
		expect(parseGold(' 45,000 ')).toBe(45000);
		expect(parseGold('850')).toBe(850);
		expect(parseGold('')).toBeNull();
		expect(parseGold('abc')).toBeNull();
		expect(parseGold('0')).toBeNull();
	});

	it('formats gold compactly', () => {
		expect(formatGold(850)).toBe('850');
		expect(formatGold(45000)).toBe('45k');
		expect(formatGold(38250)).toBe('38.3k');
		expect(formatGold(250000)).toBe('250k');
		expect(formatGold(1250000)).toBe('1.25m');
	});

	it('ranks priced upgrades by gold per 1% CP, cheapest first', () => {
		const a = up('a', 1.0); // 100k for 1% → 100k per 1%
		const b = up('b', 0.5); // 20k for 0.5% → 40k per 1%
		const c = up('c', 2.0); // unpriced
		const costs = { a: 100000, b: 20000 };
		expect(goldPerPct(b, costs)).toBe(40000);
		expect(goldPerPct(c, costs)).toBeNull();
		expect(byGold([a, b, c], costs).map((u) => u.key)).toEqual(['b', 'a']);
	});

	it('reads bound amounts, with ∞ meaning plenty', () => {
		expect(parseOwned('0')).toBe(0);
		expect(parseOwned('')).toBe(0);
		expect(parseOwned('3,000')).toBe(3000);
		expect(parseOwned('12k')).toBe(12000);
		expect(parseOwned('∞')).toBe(1e12);
		expect(parseOwned('9999999999')).toBe(9999999999);
		expect(parseOwned('99999')).toBe(99999);
		expect(parseOwned('lots')).toBeNull();
	});

	it('prices engraving book rows as price per book × books read', () => {
		const u = { ...up('engraving:1255:books:5', 1), books: { engraving: 1255, name: 'Mass Increase', count: 5 } } as Upgrade;
		expect(bookCost(u, {})).toBeUndefined();
		expect(bookCost(u, { 1255: 80000 })).toBe(400000);
		expect(bookCost(up('gem:T4:9', 1), { 1255: 80000 })).toBeUndefined();
	});
});
