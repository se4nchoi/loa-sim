import { describe, expect, it } from 'vitest';
import { autoHoningCosts, booksFor, honingCost, inventoryMaterials, tapsFor, type HoningBook } from './honing-cost';
import { HONING_COSTS, type HoningTap } from './honing-cost-data';
import { priceBudget, type BudgetChange } from './sim-budget';

const book: HoningBook = { id: 'honing-book:aegir:weapon', name: 'Test book', rate: 2000 };
const tap: HoningTap = { growth: 0, shards: 0, gold: 100, silver: 0, mats: {}, success: 2000, failBonus: 0, failMax: 0, energy: 21500, meterPerFail: 10000, breath: { id: 0, max: 0, rate: 0 } };

describe('additive honing books', () => {
	it('adds percentage points, spends nothing on pity, and computes the exact one-book break-even', () => {
		// Two taps without a book: 100 + .8*100 = 180. With +20 percentage points: 100 + .6*100 + book price.
		const c = honingCost(tap, { [book.id]: 10 }, {}, book);
		expect(c.expected).toBeCloseTo(170);
		expect(c.worst).toBe(210);
		expect(c.book).toMatchObject({ used: 1, bought: 1, savedGold: 10, breakEven: 20 });
		expect(c.breakdown!.pity.materials.find((m) => m.id === book.id)?.bought).toBe(1);
	});
	it('uses bound books first and rejects overpriced market books', () => {
		const prices = { [book.id]: 10000 };
		expect(honingCost(tap, prices, {}, book).expected).toBe(180);
		const bound = honingCost(tap, prices, { [book.id]: 1 }, book);
		expect(bound.expected).toBe(160);
		expect(bound.book).toMatchObject({ used: 1, bought: 0, savedGold: 20 });
	});
	it('never spends a book on guaranteed base chances and caps added rates at 100%', () => {
		expect(honingCost({ ...tap, success: 10000 }, { [book.id]: 0 }, {}, book).book!.used).toBe(0);
		const certain = honingCost(tap, { [book.id]: 0 }, {}, { ...book, rate: 10000 });
		expect(certain.maxTaps).toBe(1);
		expect(certain.expected).toBe(100);
	});
	it('uses sourced per-level bonuses and automatically gates by set, slot and target', () => {
		expect(booksFor('aegir', 'weapon', 11)).toMatchObject([{ id: '66112543', rate: 1000 }]);
		expect(booksFor('aegir', 'head', 13)).toMatchObject([{ id: '66112546', rate: 500 }]);
		expect(booksFor('aegir', 'weapon', 15)).toMatchObject([{ id: '66112551', rate: 400 }]);
		expect(booksFor('aegir', 'weapon', 17)).toMatchObject([{ id: '66112551', rate: 300 }]);
		expect(booksFor('aegir', 'weapon', 19)).toMatchObject([{ id: '66112553', rate: 300 }, { id: '66112555', rate: 600 }]);
		expect(booksFor('aegir', 'weapon', 20)).toMatchObject([{ id: '66112553', rate: 150 }, { id: '66112555', rate: 300 }]);
		for (const level of [10, 21, 25]) expect(booksFor('aegir', 'weapon', level)).toEqual([]);
		expect(booksFor('serca', 'weapon', 19)).toEqual([]);
		const auto = autoHoningCosts(['honing:weapon:19'], { weapon: { set: 'aegir' } }, { '66112555': 0 });
		expect(auto['honing:weapon:19'].book).toBeDefined();
		expect(honingCost(tapsFor('aegir', 'weapon', 19)!, { '66112555': 0 })).toEqual(auto['honing:weapon:19']);
		const inventory = inventoryMaterials({ weapon: { set: 'aegir' }, head: {} });
		expect(inventory).toContain('66112543'); expect(inventory).toContain('66112555');
		expect(inventory).toContain('66112546');
	});
	it('reduces average materials needed and accounts for books in a multi-step budget', () => {
		const materialTap = { ...tap, mats: { stone: 10 } };
		const c = honingCost(materialTap, { stone: 2, [book.id]: 1 }, {}, book);
		expect(c.book!.savedGold).toBeCloseTo(23);
		const row: BudgetChange = { key: 'step', title: 'Step', detail: '', section: 'Equipment', tap: { ...tap, books: [book] } };
		const budget = priceBudget([row, { ...row, key: 'step2' }], { [book.id]: 10000 }, { [book.id]: 1 }, {}, {});
		expect(budget.map((r) => r.average)).toEqual([160, 180]);
	});
	it('does not change results when no book stock or quote is available', () => {
		const t = HONING_COSTS.aegir.weapon[14];
		const { book: details, strategies, ...cost } = honingCost({ ...t, books: [book] }, {});
		const { strategies: baselineStrategies, ...baseline } = honingCost(t, {});
		expect(cost).toEqual(baseline);
		const calculations = (list: typeof strategies) => list?.map(({ materialIds, expected, firstTapChance, selected }) => ({ materialIds, expected, firstTapChance, selected }));
		expect(calculations(strategies)).toEqual(calculations(baselineStrategies));
		expect(details).toMatchObject({ used: 0, bought: 0, savedGold: 0 });
	});
	it('uses unknown-price books only up to entered bound stock', () => {
		expect(honingCost(tap, {}, {}, book).book).toMatchObject({ used: 0, unavailable: true });
		const bound = honingCost(tap, {}, { [book.id]: 1 }, book);
		expect(bound.expected).toBe(160); expect(bound.book).toMatchObject({ bought: 0, unavailable: false });
		const free = honingCost(tap, { [book.id]: 0 }, {}, book);
		expect(free.book).toMatchObject({ used: 1, bought: 1, unavailable: false });
	});
	it('compares regular and enhanced books without stacking them and reports odds', () => {
		const regular = { ...book, id: 'regular', rate: 1000 };
		const enhanced = { ...book, id: 'enhanced', rate: 2000 };
		const c = honingCost(tap, { regular: 0, enhanced: 0 }, {}, [regular, enhanced]);
		expect(c.expected).toBe(160);
		expect(c.strategies!.find(s => s.selected)?.firstTapChance).toBeCloseTo(0.4);
		expect(c.strategies!.every(s => !(s.materialIds.includes('regular') && s.materialIds.includes('enhanced')))).toBe(true);
		const market = honingCost(tap, { regular: 1, enhanced: 100 }, {}, [regular, enhanced]);
		expect(market.book!.name).toBe(book.name); expect(market.expected).toBe(171);
	});

});
