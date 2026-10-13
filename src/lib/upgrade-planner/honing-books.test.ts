import { describe, expect, it } from 'vitest';
import { autoHoningCosts, bookFor, honingCost, type HoningBook } from './honing-cost';
import { HONING_COSTS, type HoningTap } from './honing-cost-data';
import { priceBudget, type BudgetChange } from './sim-budget';

const book: HoningBook = { id: 'honing-book:aegir:weapon', name: 'Test book', rate: 2000, from: 1, to: 20 };
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
		expect(honingCost({ ...tap, success: 10000 }, {}, {}, book).book!.used).toBe(0);
		const certain = honingCost(tap, {}, {}, { ...book, rate: 10000 });
		expect(certain.maxTaps).toBe(1);
		expect(certain.expected).toBe(100);
	});
	it('gates books by set, slot and target level, keeping Serca disabled unless explicitly configured', () => {
		const books = { 'aegir:weapon': book };
		expect(bookFor('aegir', 'weapon', 20, books)).toEqual(book);
		expect(bookFor('aegir', 'head', 20, books)).toBeUndefined();
		expect(bookFor('aegir', 'weapon', 21, books)).toBeUndefined();
		expect(bookFor('serca', 'weapon', 10, books)).toBeUndefined();
		const auto = autoHoningCosts(['honing:weapon:10'], { weapon: { set: 'aegir' } }, {}, {}, {}, books);
		expect(auto['honing:weapon:10'].book).toBeDefined();
		expect(bookFor('serca', 'weapon', 10, { 'serca:weapon': book })).toEqual(book);
	});
	it('reduces average materials needed and accounts for books in a multi-step budget', () => {
		const materialTap = { ...tap, mats: { stone: 10 } };
		const c = honingCost(materialTap, { stone: 2, [book.id]: 1 }, {}, book);
		expect(c.book!.savedGold).toBeCloseTo(23);
		const row: BudgetChange = { key: 'step', title: 'Step', detail: '', section: 'Equipment', tap, honing: { set: 'aegir', slot: 'weapon', level: 10 } };
		const budget = priceBudget([row, { ...row, key: 'step2' }], { [book.id]: 10000 }, { [book.id]: 1 }, {}, {}, { 'aegir:weapon': book });
		expect(budget.map((r) => r.average)).toEqual([160, 180]);
	});
	it('does not change results when books are unconfigured', () => {
		const t = HONING_COSTS.aegir.weapon[14];
		expect(honingCost(t, {}, {}, undefined)).toEqual(honingCost(t, {}));
	});
});
