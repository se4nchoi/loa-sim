import { describe, expect, it } from 'vitest';
import { STONE_PATTERNS, bestStones, hasStoneBonus, stoneAtkPct } from './stones';

// Each engraving gains `weight × level` from a stone; the score is the sum.
const scorer = (weights: Record<number, number>) => (stones: Record<number, number>) =>
	Object.entries(stones).reduce((sum, [id, lv]) => sum + weights[Number(id)] * lv, 0);

describe('bestStones', () => {
	it('puts the higher line on the engraving that gains most from it', () => {
		const picks = bestStones([1, 2, 3], scorer({ 1: 1, 2: 3, 3: 2 }));
		const p42 = picks.find((p) => p.pattern[0] === 4 && p.pattern[1] === 2)!;
		expect(p42.stones).toEqual({ 2: 4, 3: 2 });
		expect(p42.pct).toBe(16);
	});

	it('tries every level pair once, either way round', () => {
		expect(STONE_PATTERNS).toHaveLength(10);
		const picks = bestStones([1, 2], scorer({ 1: 1, 2: 5 }));
		expect(picks.find((p) => p.pattern[0] === 3 && p.pattern[1] === 1)!.stones).toEqual({ 2: 3, 1: 1 });
	});

	it('covers every pattern once, best first', () => {
		const picks = bestStones([1, 2], scorer({ 1: 1, 2: 1 }));
		expect(picks).toHaveLength(STONE_PATTERNS.length);
		expect(picks.map((p) => p.pct)).toEqual([...picks.map((p) => p.pct)].sort((a, b) => b - a));
	});

	it('needs two engravings for a two-line stone', () => {
		const picks = bestStones([7], scorer({ 7: 1 }));
		expect(picks).toEqual([]);
		expect(bestStones([], scorer({}))).toEqual([]);
	});
});

describe('stone Atk. Power bonus', () => {
	it('needs 16 nodes on the two engraving lines', () => {
		expect(stoneAtkPct([9, 7])).toBe(1.5);
		expect(stoneAtkPct([10, 6])).toBe(1.5);
		expect(stoneAtkPct([9, 6])).toBe(0);
		expect(stoneAtkPct([7, 7])).toBe(0);
	});

	it('caps at one bonus however many nodes', () => {
		expect(stoneAtkPct([10, 7])).toBe(1.5);
		expect(stoneAtkPct([9, 9])).toBe(1.5);
	});

	it('marks the stones reaching 16 nodes', () => {
		expect(STONE_PATTERNS.filter(hasStoneBonus)).toEqual([[4, 4], [4, 3], [4, 2], [4, 1], [3, 3], [3, 2]]);
	});
});
