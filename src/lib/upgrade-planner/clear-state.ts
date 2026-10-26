// A clear's setup as a Simulator state. The clear's lostark.bible snapshot has its gear but no battle point parts, so
// it can't be scored alone; the character page's loadout can. So the snapshot becomes edits on that loadout: its items
// (honing, quality, accessories, bracelet, bracer), Ark Grid cores, karma, engravings and gems, as Apply would make
// them. The Simulator then scores the clear's setup from the loadout's parts. Ark Passive's CP part follows points
// spent, not which nodes, so a different build (Full Moon Harvester vs Night's Edge) doesn't move CP here.
import type { ClearSnapshot } from '$lib/bible-data';
import { GEM_REGULAR, GEM_SKILL_ALIAS } from './game-data';
import { orbChoices, orbName, orbOfRun, orbSeason } from './paradise';
import { coreVariant, GEM_EFFECT_TYPE, initSimState, simulate, type SimCore, type SimState } from './simulate';
import { decodeCore } from './tables';
import { STONE_LEVEL_NODES } from './stones';
import type { Loadout } from './types';

export interface ClearState {
	state: SimState;
	/** What couldn't be carried over ("Paradise orb isn't in the snapshot"). */
	notes: string[];
	/** The Paradise orb read from the clear's recorded CP (a snapshot doesn't name it), or null if kept. */
	orb: number | null;
}

const books = (e: { grade?: string; progress?: number }) =>
	e.grade === 'engrave_grade05' ? 4 : Math.max(0, Math.min(4, Math.floor((e.progress || 0) / 5)));

/** `runSkills`: the run's logged skills, when known (its Paradise orb proc names the orb). */
export function clearState(loadout: Loadout, snap: ClearSnapshot, runSkills?: { id: number }[]): ClearState {
	const notes: string[] = [];
	const base = initSimState(loadout);
	// Item- and core-based parts: read straight from a loadout carrying the snapshot's items, cores and karma.
	const items = initSimState({ ...loadout, items: snap.items ?? loadout.items, arkGridCores: snap.arkGridCores ?? loadout.arkGridCores, karma: snap.karma ?? loadout.karma });
	const state: SimState = {
		...base,
		gear: items.gear, quality: items.quality, accessories: items.accessories, accessoryStats: items.accessoryStats,
		bracelet: items.bracelet, bracer: items.bracer, sidereal: items.sidereal, karma: items.karma
	};

	// Ark Grid: the Simulator keeps the loadout's core in each slot and records a swap as another grade or (chaos)
	// option. So each clear core goes to the loadout's core of the same order/chaos shape, with its astrogems. An Order
	// core's battle points depend on shape, grade and points only, so Soul Core in place of Moonlit Midnight scores the
	// same at the same points.
	const slot = (id: number) => String(id).slice(3, 5);
	state.arkGrid = base.arkGrid.map((core) => {
		const match = (snap.arkGridCores ?? []).find((c) => slot(c.id) === slot(core.id));
		if (!match) return core;
		const out: SimCore = { id: core.id, gems: items.arkGrid.find((c) => c.id === match.id)?.gems ?? core.gems };
		const was = decodeCore(core.id), now = decodeCore(match.id);
		if (was && now && now.grade !== was.grade) out.grade = now.grade;
		if (now?.attr === 'chaos' && coreVariant(match.id) !== coreVariant(core.id)) out.variant = coreVariant(match.id);
		if (now?.attr === 'order' && String(match.id).slice(0, 8) !== String(core.id).slice(0, 8)) out.as = match.id;
		return out;
	});

	// Engravings: the Simulator keys them by the loadout's own; the clear's take their place (same engraving: its books
	// and stone; another one: swapped in with `as`).
	const stoneLines = (snap.items?.find((i) => i.slot === 'ability_stone')?.data.engravings ?? []) as { id: number; nodes: number }[];
	const stoneOf = (id: number) => STONE_LEVEL_NODES.findLastIndex((n) => (stoneLines.find((s) => s.id + 1000 === id)?.nodes ?? 0) >= n);
	const clearEngravings = (snap.engravings ?? []).map((e) => ({ id: e.id, books: books(e), stone: stoneOf(e.id) }));
	if (clearEngravings.length) {
		const ids = Object.keys(base.engravings).map(Number);
		const unmatched = clearEngravings.filter((e) => !ids.includes(e.id));
		state.engravings = Object.fromEntries(ids.map((id) => {
			const same = clearEngravings.find((e) => e.id === id);
			if (same) return [id, { books: same.books, stone: same.stone }];
			const other = unmatched.shift();
			return [id, other ? { books: other.books, stone: other.stone, as: other.id } : { ...base.engravings[id], books: 0, stone: 0 }];
		}));
		for (const e of unmatched) state.engravings[e.id] = { books: e.books, stone: e.stone, added: true };
	}

	// Gems: in slot order, like the loadout's; level, kind and skill from each gem's id and effects.
	const gems = (snap.gems ?? []).toSorted((a, b) => a.slot - b.slot);
	if (gems.length === base.gems.length) {
		state.gems = base.gems.map((g, i) => {
			const gem = gems[i];
			const effect = gem.effects?.find((e) => GEM_EFFECT_TYPE[e.type]);
			return { ...g, level: Math.floor((GEM_REGULAR[gem.id] ?? gem.id) / 10) % 100, kind: effect ? GEM_EFFECT_TYPE[effect.type] : g.kind, skill: effect ? (GEM_SKILL_ALIAS[effect.id] ?? effect.id) : g.skill };
		});
	} else if (gems.length) notes.push("The clear had a different number of gems; the loadout's gems are kept.");

	// Paradise: a snapshot keeps neither the orb nor its power, and power is per season (a Season 3 orb scales with
	// Season 3's). The run's orb proc names the orb (Broadwave: Rhythmic Tide, Season 3; Sunlight Fragrance: Blazing Sun,
	// Season 4); without one, the orb is the one that fits the recorded CP. Then that orb's season power is solved from
	// the recorded CP. The current season's only grows, so up to today's; an older season's is fixed since it ended and
	// can be above today's current-season power. Soulshan (10-26): Rhythmic Tide on 31.56M Season 3 power on every run
	// 10-08..10-16 (a finished season: unchanged across the weekly reset); Blazing Sun at 86% of today's Season 4 on 10-17.
	let orb: number | null = null;
	const recorded = snap.combatPower?.score;
	const today = base.paradise;
	if (today && !today.flat) {
		const nowSeason = orbSeason(today.orb);
		const withPower = (id: number, power: number) => {
			const season = orbSeason(id);
			return { ...today, orb: id, powers: season === null ? today.powers : { ...today.powers, [season]: Math.round(power) } };
		};
		const powerOf = (id: number) => { const season = orbSeason(id); return season === null ? 0 : today.powers[season] ?? 0; };
		const cpAt = (id: number, power: number) => simulate(loadout, { ...state, paradise: withPower(id, power) }, base).cp;
		/** The orb's season power that gives the recorded CP; null when none in range does. */
		const powerFor = (id: number) => {
			const now = powerOf(id);
			if (!recorded || !(now > 0)) return null;
			if (Math.abs(cpAt(id, now) - recorded) < 0.01) return now;
			const [min, max] = orbSeason(id) === nowSeason ? [now * 0.7, now] : [now * 0.5, now * 2];
			if (cpAt(id, max) < recorded - 0.005 || cpAt(id, min) > recorded + 0.005) return null;
			let lo = min, hi = max;
			for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (cpAt(id, m) < recorded) lo = m; else hi = m; }
			return hi;
		};
		const procOrb = orbOfRun(runSkills ?? []);
		// Without a proc: the orb that fits with the least change to today's power.
		const fitted = procOrb ? null : orbChoices(today).flatMap((id) => { const p = powerFor(id); return p === null ? [] : [{ id, change: Math.abs(p / powerOf(id) - 1) }]; })
			.toSorted((x, y) => x.change - y.change)[0]?.id ?? null;
		const played = procOrb ?? fitted ?? today.orb;
		if (played !== today.orb) {
			orb = played;
			notes.push(`Paradise orb: ${orbName(played)}, from the run's ${procOrb ? 'orb proc' : 'CP'}.`);
		}
		const power = powerFor(played);
		state.paradise = withPower(played, power ?? powerOf(played));
		const season = orbSeason(played);
		if (power !== null && Math.abs(power / powerOf(played) - 1) > 0.001)
			notes.push(`Season ${season} Paradise power: ${(power / 1e6).toFixed(2)}M, from the run's CP.`);
		else if (power === null && recorded) notes.push(`The run's Season ${season} Paradise power can't be read from its CP; today's is used.`);
	}
	return { state, notes, orb };
}
