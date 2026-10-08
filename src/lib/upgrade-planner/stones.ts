// Ability stone suggestions: which of the chosen engravings a stone's two lines should go on for the most Combat Power.

/**
 * Every stone result with both engraving lines at Lv. 1–4, as [higher line, lower line]. Each one is tried both ways
 * round on every pair of engravings, so 9/6 also covers 6/9.
 */
export const STONE_PATTERNS: readonly (readonly [number, number])[] = [4, 3, 2, 1].flatMap((a) =>
	[4, 3, 2, 1].filter((b) => b <= a).map((b) => [a, b] as const)
);

/** Fewest nodes on a line for each stone engraving level (Lv. 2 is 7 or 8 nodes). */
export const STONE_LEVEL_NODES = [0, 6, 7, 9, 10];
/** A stone whose two engraving lines reach 16 nodes together (9/7, 10/6, …) adds Atk. Power; more nodes add no more. */
const STONE_BONUS_NODES = 16;
export const STONE_BONUS_ATK_PCT = 1.5;

/** Atk. Power % from a stone's two engraving lines, given their node counts. */
export const stoneAtkPct = (nodes: number[]) =>
	nodes.reduce((sum, n) => sum + n, 0) >= STONE_BONUS_NODES ? STONE_BONUS_ATK_PCT : 0;

/** Node counts of the stone lines implied by engraving stone levels (fewest nodes per level). */
export const stoneLevelNodes = (levels: number[]) =>
	levels
		.filter((lv) => lv > 0)
		.sort((a, b) => b - a)
		.slice(0, 2)
		.map((lv) => STONE_LEVEL_NODES[lv]);

/** Whether a stone with these levels gets the Atk. Power bonus. */
export const hasStoneBonus = (pattern: readonly number[]) => stoneAtkPct(stoneLevelNodes([...pattern])) > 0;

export interface StonePick {
	pattern: readonly [number, number];
	/** Engraving id → stone level; every other engraving goes without. */
	stones: Record<number, number>;
	/** Score of this assignment (e.g. CP change in percent). */
	pct: number;
}

/**
 * For each stone pattern, the engravings to put it on that score best. `score` rates a full assignment
 * (engravings left out get no stone). Sorted best first.
 */
export function bestStones(ids: number[], score: (stones: Record<number, number>) => number): StonePick[] {
	const picks: StonePick[] = [];
	for (const pattern of STONE_PATTERNS) {
		const [a, b] = pattern;
		let best: StonePick | null = null;
		for (const x of ids) {
			for (const y of ids.filter((y) => y !== x && (a !== b || y > x))) {
				const stones = { [x]: a, [y]: b };
				const pct = score(stones);
				if (!best || pct > best.pct) best = { pattern, stones, pct };
			}
		}
		if (best) picks.push(best);
	}
	return picks.sort((p, q) => q.pct - p.pct);
}
