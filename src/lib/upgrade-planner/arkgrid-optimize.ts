// Best placement of the equipped astrogems across ark grid cores, for Combat Power.
//
// An astrogem's options count wherever it sits, so placement only changes each core's points (and therefore
// its breakpoint value). Each core holds at most 4 astrogems whose willpower must fit the core's supply.
// Order and chaos gems only go into their own cores, so the two sides are searched independently with an
// exhaustive depth-first search (≤ 12 gems per side). A gem may be left out if it fits nowhere; it then
// loses its options, which the score accounts for.

import { ASTROGEM_ITEMS, ASTROGEM_KINDS } from './game-data';
import { roleOf } from './roles';
import { initSimState, simCoreInfo, simCoreValue, type SimAstrogem, type SimState } from './simulate';
import { CORE_WILLPOWER } from './tables';
import type { Loadout } from './types';
import { astrogemTotals, coreStates, weaponPowerOf } from './upgrades';

const MAX_GEMS_PER_CORE = 4;

export const astrogemWillpower = (g: SimAstrogem) => {
	const kind = ASTROGEM_KINDS[ASTROGEM_ITEMS[g.itemId]];
	return kind ? kind.willpower - g.costReduc : 0;
};

export interface Arrangement {
	/** New gems for each core, by core id. */
	cores: Record<number, SimAstrogem[]>;
	/** Gems that don't fit anywhere. */
	leftOut: SimAstrogem[];
}

/** `base` is the unedited state the simulator anchors on (bible's own values). */
export function optimizeArkGrid(l: Loadout, state: SimState, base: SimState = initSimState(l)): Arrangement {
	const wp = weaponPowerOf(l);
	const cores = coreStates(l);
	const totals = astrogemTotals(l);
	const role = roleOf(l);
	const result: Arrangement = { cores: {}, leftOut: [] };

	for (const attr of ['order', 'chaos'] as const) {
		const side = cores.filter((c) => c.info.attr === attr);
		const sideState = side.map((c) => state.arkGrid.find((x) => x.id === c.id));
		const gems = sideState.flatMap((s) => s?.gems ?? []);
		if (!side.length || !gems.length) continue;

		// Anchor like the simulator: bible's points per core, offset by the points the unedited state places there.
		const placed = side.map((c) => base.arkGrid.find((x) => x.id === c.id)?.gems.reduce((sum, g) => sum + g.corePoints, 0) ?? 0);
		// Precomputed per core: CP factor for every point total the search can reach (0–20 placed points).
		const info = side.map((c, ci) => simCoreInfo(c.info, sideState[ci]));
		// (Supports: Buff and Shield & Heal cores both count as a factor here; close enough to rank placements.)
		const coreFactor = side.map((c, ci) =>
			Array.from({ length: 21 }, (_, points) => 1 + simCoreValue(c, sideState[ci], c.points - placed[ci] + points, wp).value / 1e4)
		);
		const cap = info.map((i) => CORE_WILLPOWER[i.grade]);
		const wpOf = gems.map(astrogemWillpower);

		// Options lost by leaving gems out, as a CP factor (relative to everything equipped).
		const levelIn = (s: SimState, id: number) =>
			s.arkGrid.reduce((sum, c) => sum + c.gems.reduce((a, g) => a + g.opts.filter((o) => o.id === id).reduce((x, o) => x + o.level, 0), 0), 0);
		const levelNow = Object.fromEntries(role.astrogemOptions.map((id) => [id, levelIn(state, id)]));
		const levelBase = Object.fromEntries(role.astrogemOptions.map((id) => [id, levelIn(base, id)]));
		const optionFactor = (out: number[]) => {
			let f = 1;
			for (const id of role.astrogemOptions) {
				const removed = out.reduce((s, gi) => s + gems[gi].opts.filter((o) => o.id === id).reduce((a, o) => a + o.level, 0), 0);
				if (!removed) continue;
				const anchor = totals.levels[id] - levelBase[id];
				const v = (lv: number) => totals.values[id] + role.astrogemValue(id, anchor + lv) - role.astrogemValue(id, totals.levels[id]);
				f *= (1e4 + v(levelNow[id] - removed)) / (1e4 + v(levelNow[id]));
			}
			return f;
		};

		// Place big gems first so willpower runs out early on bad branches.
		const order = gems.map((_, i) => i).sort((a, b) => gems[b].corePoints - gems[a].corePoints || wpOf[b] - wpOf[a]);
		const assign = new Array<number>(gems.length).fill(-1);
		const count = side.map(() => 0);
		const used = side.map(() => 0);
		const points = side.map(() => 0);
		let best = -1;
		let bestAssign = assign.slice();

		const out: number[] = [];
		const leaf = () => {
			let score = 1;
			for (let c = 0; c < side.length; c++) score *= coreFactor[c][Math.min(points[c], 20)];
			if (out.length) score *= optionFactor(out);
			if (score > best + 1e-12) {
				best = score;
				bestAssign = assign.slice();
			}
		};
		const dfs = (k: number) => {
			if (k === order.length) return leaf();
			const gi = order[k];
			let fits = false;
			for (let c = 0; c < side.length; c++) {
				if (count[c] >= MAX_GEMS_PER_CORE || used[c] + wpOf[gi] > cap[c]) continue;
				fits = true;
				assign[gi] = c;
				count[c]++;
				used[c] += wpOf[gi];
				points[c] += gems[gi].corePoints;
				dfs(k + 1);
				count[c]--;
				used[c] -= wpOf[gi];
				points[c] -= gems[gi].corePoints;
			}
			assign[gi] = -1;
			// Leave a gem out only when it fits nowhere; leaving out a gem that fits never adds points.
			if (fits) return;
			out.push(gi);
			dfs(k + 1);
			out.pop();
		};
		dfs(0);

		side.forEach((c, ci) => (result.cores[c.id] = gems.filter((_, gi) => bestAssign[gi] === ci).map((g) => structuredClone(g))));
		result.leftOut.push(...gems.filter((_, gi) => bestAssign[gi] === -1));
	}
	return result;
}

/** Applies an arrangement to a copy of the state. */
export function withArrangement(state: SimState, a: Arrangement): SimState {
	const s = structuredClone(state);
	for (const core of s.arkGrid) if (a.cores[core.id]) core.gems = structuredClone(a.cores[core.id]);
	return s;
}
