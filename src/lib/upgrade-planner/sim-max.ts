import { ASTROGEM_ITEMS, ASTROGEM_KINDS, BRACELET_EFFECTS, ITEMS } from './game-data';
import { SUPPORT_BRACELET_EFFECTS } from './support-data';
import { astrogemWillpower } from './arkgrid-optimize';
import { roleOf } from './roles';
import { coreVariant, simulate, type BraceletLine, type SimAstrogem, type SimState } from './simulate';
import { CORE_WILLPOWER } from './tables';
import type { Loadout } from './types';
import type { CoreState } from './upgrades';

type ScoreEdit = (edit: (s: SimState) => void) => number;

/** Candidate searches replace the same field each time; snapshot the UI only once per search. */
export function maxScore(l: Loadout, snapshot: SimState, base: SimState): ScoreEdit {
	const scratch = structuredClone(snapshot);
	return (edit) => { edit(scratch); return simulate(l, scratch, base).cp; };
}

export function maxEquipment(s: SimState) {
	for (const g of Object.values(s.gear)) { g.honing = 25; g.advanced = 40; }
	if (s.sidereal) Object.assign(s.sidereal, { infusion: 3, evolution: 10, advanced: 40 });
	s.bracer = { grade: 'ancient', honing: 25 };
}

function maxGemChoices(attr: 'order' | 'chaos', scoring: number[]): SimAstrogem[] {
	return Object.entries(ASTROGEM_ITEMS)
		.filter(([id, kind]) => Number(id) >= 67400000 && Number(id) < 67500000 && ITEMS[Number(id)]?.[2] === 6 && ASTROGEM_KINDS[kind].attr === attr)
		.map(([id, kind]) => ({
			itemId: Number(id), corePoints: 5, costReduc: 5,
			opts: ASTROGEM_KINDS[kind].options.filter((id) => scoring.includes(id)).map((id) => ({ id, level: 5 }))
		}));
}

/** Max one gem within the current core, or a whole core (Ancient + four max-cut gems). */
export function maxArkGridCore(l: Loadout, s: SimState, core: CoreState, score: ScoreEdit, gi?: number) {
	const ci = s.arkGrid.findIndex((c) => c.id === core.id);
	if (ci < 0) return;
	const current = s.arkGrid[ci];
	const role = roleOf(l);
	const choices = maxGemChoices(core.info.attr, role.astrogemOptions);
	const cap = CORE_WILLPOWER[gi === undefined ? 'ancient' : current.grade ?? core.info.grade];
	const variants = gi !== undefined || core.info.attr === 'order' ? [current.variant ?? coreVariant(core.id)]
		: role.support ? [0, 1, 2, 3, 4, 5] : core.info.shape === 'star' ? [0, 1] : [0, 1, 2];
	// Copy fields explicitly: the UI passes Svelte proxies, which structuredClone cannot read.
	const gems = current.gems.map((g) => ({ ...g, opts: g.opts.map((o) => ({ ...o })) }));
	const targets = gi === undefined ? [0, 1, 2, 3] : [gi];
	let best = -Infinity;
	let winner: SimState['arkGrid'][number] | undefined;
	const visit = (i: number) => {
		if (i < targets.length) {
			for (const g of choices) { gems[targets[i]] = g; visit(i + 1); }
			return;
		}
		if (gems.reduce((sum, g) => sum + astrogemWillpower(g), 0) > cap) return;
		for (const variant of variants) {
			const candidate = { ...current, ...(gi === undefined ? { grade: 'ancient' as const } : {}), variant, gems };
			const cp = score((state) => { state.arkGrid[ci] = candidate; });
			if (cp > best) {
				best = cp;
				// Equal kinds may reuse a search candidate, but equipped gems must remain independently editable.
				winner = { ...candidate, gems: gems.map((g) => ({ ...g, opts: g.opts.map((o) => ({ ...o })) })) };
			}
		}
	};
	visit(0);
	if (winner) s.arkGrid[ci] = winner;
}

/** Highest legal T4 rolls, from itemRandom 213400023#6 (Ancient bracelet). */
export const BRACELET_MAX_STATS = [
	{ kind: 'stat', index: 11, value: 16000 },
	{ kind: 'stat', index: 6, value: 6000 },
	...[15, 16, 18, 17, 19, 20].map((index) => ({ kind: 'stat' as const, index, value: 120 }))
] satisfies BraceletLine[];

/** Search two distinct stat lines and three distinct high-roll effect families using simulated CP. */
export function maxBracelet(l: Loadout, score: ScoreEdit): SimState['bracelet'] {
	const role = roleOf(l);
	const catalog = role.support ? SUPPORT_BRACELET_EFFECTS : BRACELET_EFFECTS;
	const effects: { family: string; line: BraceletLine }[] = catalog.filter((e) => e.t4 && e.grade === 0)
		.map((e) => ({ family: e.family, line: { kind: 'effect', key: e.key } }));
	for (const [index, value] of [[74, 500], [76, 1000], [50, 400], [151, 9000]])
		effects.push({ family: `stat:${index}`, line: { kind: 'stat', index, value } });
	for (const [type, value] of [[54, 600], [59, 900]])
		effects.push({ family: `type:${type}`, line: { kind: 'stat', type, index: 0, value } });

	const pairs = BRACELET_MAX_STATS.flatMap((a, i) => BRACELET_MAX_STATS.slice(i + 1).map((b) => ({
		lines: [a, b], main: (a.index === 11 ? a.value : 0) + (b.index === 11 ? b.value : 0),
		combat: a.value * (role.combatStatBp[a.index] ?? 0) + b.value * (role.combatStatBp[b.index] ?? 0)
	})));
	// Only main stat and the role's combat-stat sum score. Discard dominated pairs and equivalent ties.
	const stats = pairs.filter((p, i) => !pairs.some((q, j) => q.main >= p.main && q.combat >= p.combat
		&& (q.main > p.main || q.combat > p.combat || j < i)));
	let best = -Infinity;
	let winner: SimState['bracelet'] = null;
	for (let a = 0; a < effects.length; a++) for (let b = a + 1; b < effects.length; b++) for (let c = b + 1; c < effects.length; c++) {
		const picks = [effects[a], effects[b], effects[c]];
		if (new Set(picks.map((p) => p.family)).size !== 3) continue;
		for (const pair of stats) {
			const candidate = { lines: [...pair.lines, ...picks.map((p) => p.line)] };
			const cp = score((s) => { s.bracelet = candidate; });
			if (cp > best) { best = cp; winner = candidate; }
		}
	}
	return winner ? structuredClone(winner) : null;
}
