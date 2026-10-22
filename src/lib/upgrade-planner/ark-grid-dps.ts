// Order Ark Grid cores in the DPS meter: what a core change (another grade, more points, another core) does to each
// skill of a recorded clear. Loaded only in DPS mode (the core table is large).
//   - always on ("Stygian Skill Damage +3%", "Astaros Damage +18%", "Damage to foes +1%"): a skill it covers gets
//     (1 + new) / (1 + old);
//   - in a state ("In Deathlord Mode, Stygian Skill Damage +18%") or on a Destiny buff ("Destiny: Footsteps of the
//     Dead: Stygian Skill Damage +54% for 2 casts"): only the share of the skill's damage LOA Logs recorded under that
//     buff changes, by (1 + new) / (1 + old). A state or buff this clear never had can't be placed in it, so it isn't
//     valued (said so); neither is a state the logs don't record ("With Possession").
// Anything else a core does (cooldowns, casting speed, meters) isn't valued yet and is named.
import type { RunSummary } from '$lib/logs/protocol';
import { ORDER_CORE_EFFECTS, ORDER_CORES, TRIPOD_TIERS, type OrderCoreEffect } from './order-cores';
import { SKILL_GROUPS } from './skill-groups';
import { initSimState, simCorePoints, type SimCore, type SimState } from './simulate';
import { swappedCoreId } from './support';
import { decodeCore } from './tables';
import type { Loadout } from './types';

type RunSkill = RunSummary['skills'][number];

/**
 * The order core a slot holds in a state: the one actually played (`as`) at the slot's simulated grade (a grade swap
 * is kept relative to the slot's own core, so no swap means that core's grade); null for chaos.
 */
export function orderCoreOf(core: SimCore): number | null {
	const id = core.as ?? core.id;
	const info = decodeCore(id), slot = decodeCore(core.id);
	if (!info || !slot || info.attr !== 'order') return null;
	const grade = core.grade ?? slot.grade;
	return grade !== info.grade ? swappedCoreId(id, grade) : id;
}

/**
 * Where an effect applies: always (''), under a named buff or state ('state:Destiny: Footsteps of the Dead',
 * 'state:Deathlord Mode'), or under an unnamed Destiny buff by its feature id ('buff:34622').
 */
const whereOf = (e: OrderCoreEffect) => (e.buff ? `state:${e.buff}` : e.feature ? `buff:${Math.floor(e.feature / 100)}` : e.when ? `state:${e.when}` : '');
/** And on which part of a skill's damage: all of it (''), its crits, or its frontal / back attacks. */
const keyOf = (e: OrderCoreEffect) => `${whereOf(e)}#${e.crit ? 'crit' : e.position ?? ''}`;
const splitKey = (key: string) => { const i = key.lastIndexOf('#'); return { where: key.slice(0, i), portion: key.slice(i + 1) }; };
/** One Destiny buff's levels replace each other (relic 54% → ancient 64%); two buffs of one feature don't. */
const levelKey = (e: OrderCoreEffect) => `${e.buff ?? ''}|${e.feature}`;
/** A logged buff's name for a state: the same name, or for a mode/stance its word in the buff ("Hype Mode" → "Level 3 Hype"). */
export const buffMatches = (buff: string, state: string) =>
	buff === state || (/ (Mode|Stance)$/.test(state) && buff.split(' ').includes(state.replace(/ (Mode|Stance)$/, '')));

interface Active {
	/** Valued effects by where they apply. */
	effects: Map<string, OrderCoreEffect[]>;
	/** Effects that aren't valued. */
	other: string[];
}

/** A core's effects at these points; of a Destiny feature's levels only the highest counts (it upgrades the lower). */
export function activeEffects(coreId: number | null, points: number): Active {
	const out: Active = { effects: new Map(), other: [] };
	const core = coreId === null ? undefined : ORDER_CORES[coreId];
	if (!core) return out;
	const all = core.bonuses.filter(([need]) => points >= need).flatMap(([, option]) => ORDER_CORE_EFFECTS[option] ?? []);
	const top = new Map<string, number>();
	for (const e of all) if (e.feature) top.set(levelKey(e), Math.max(top.get(levelKey(e)) ?? 0, e.level ?? 0));
	for (const e of all) {
		if (e.text) { out.other.push(e.text); continue; }
		if (e.feature && (e.level ?? 0) < (top.get(levelKey(e)) ?? 0)) continue;
		const key = keyOf(e);
		out.effects.set(key, [...(out.effects.get(key) ?? []), e]);
	}
	return out;
}

/** Whether an effect covers a skill: it names the skill, or one of its groups ("Stygian", "Holding"), or every skill. */
/** Whether a character took a tripod on a skill (bible's skills list one pick per tier); unknown → taken. */
export type TripodCheck = (skill: number, tripod: string) => boolean;
export function tripodsOf(loadout: Loadout): TripodCheck {
	const skills = (loadout as Loadout & { skills?: { id: number; tripods?: number[] }[] }).skills;
	if (!Array.isArray(skills)) return () => true;
	return (skill, tripod) => {
		const picks = skills.find((s) => s.id === skill)?.tripods;
		const tiers = TRIPOD_TIERS[skill];
		if (!picks || !tiers) return true;
		return picks.some((pick, tier) => tiers[tier]?.[pick - 1] === tripod);
	};
}
const applies = (e: OrderCoreEffect, skill: number, groups: string[] | undefined, took: TripodCheck) =>
	!e.except?.includes(skill) && (!e.tripod || took(skill, e.tripod)) &&
	(e.groups === null || !!e.skills?.includes(skill) || !!e.groups?.some((g) => groups?.includes(g)));
const bonus = (effects: OrderCoreEffect[] | undefined, skill: number, groups: string[] | undefined, took: TripodCheck) =>
	(effects ?? []).reduce((m, e) => (!e.stat && applies(e, skill, groups, took) ? m * (1 + (e.pct ?? 0)) : m), 1);
/** Crit Rate / Crit Damage the effects add to a skill (percentage points as fractions: 0.25 = +25%). */
const critAdd = (effects: OrderCoreEffect[] | undefined, stat: 'critRate' | 'critDamage', skill: number, groups: string[] | undefined, took: TripodCheck) =>
	(effects ?? []).reduce((sum, e) => (e.stat === stat && applies(e, skill, groups, took) ? sum + (e.pct ?? 0) : sum), 0);

/**
 * A skill's crit rate and crit multiplier in a run. The multiplier comes from LOA Logs' own stat value when the log has
 * it: +1% Crit Damage adds (crit share of damage) / multiplier percent, so multiplier = crit share / that value;
 * this works for 100% crit builds too. Otherwise from the hits: the average crit hit over the average non-crit hit
 * (per skill, or the run's damage-weighted one for skills with few of either).
 */
export function critProfile(run: RunSummary) {
	const damage = run.skills.reduce((t, s) => t + s.damage, 0);
	const critShare = damage ? run.skills.reduce((t, s) => t + s.critDamage, 0) / damage : 0;
	const perPoint = run.statValues?.critDamage;
	// +1% Crit Damage (0.01) adds perPoint% = critShare x 0.01 / multiplier.
	const logged = perPoint && perPoint > 0 && critShare > 0 ? critShare / perPoint : null;
	if (logged && logged > 1 && logged < 10) return (s: RunSkill) => ({ rate: s.hits ? Math.min(1, s.crits / s.hits) : 0, multiplier: logged });
	const own = (s: RunSkill) => {
		const nonCrits = s.hits - s.crits;
		if (s.crits < 3 || nonCrits < 3 || !(s.damage > s.critDamage)) return null;
		const m = (s.critDamage / s.crits) / ((s.damage - s.critDamage) / nonCrits);
		return m > 1 && m < 10 ? m : null;
	};
	let weight = 0, sum = 0;
	for (const s of run.skills) { const m = own(s); if (m) { weight += s.damage; sum += s.damage * m; } }
	const pooled = weight ? sum / weight : null;
	return (s: RunSkill) => ({ rate: s.hits ? Math.min(1, s.crits / s.hits) : 0, multiplier: own(s) ?? pooled });
}

/** Expected hit, relative: 1 + rate × (multiplier − 1); a crit change moves rate and multiplier. */
export function critRatio(rate: number, multiplier: number, addRate: number, addDamage: number): number {
	const before = 1 + rate * (multiplier - 1);
	const after = 1 + Math.min(1, Math.max(0, rate + addRate)) * (multiplier + addDamage - 1);
	return after / before;
}

export interface ArkGridEffect {
	/** The multiplier on a skill's recorded damage in this run. */
	factor: (skill: RunSkill) => number;
	/** What changed but isn't valued ("Footsteps of the Dead: Stygian Skill cooldown -50% ..."). */
	unvalued: string[];
	/** Some order core changed. */
	changed: boolean;
}

/** The order core changes between the clear's setup (`base`) and the simulated one, valued on one recorded run. */
export function orderCoreEffect(loadout: Loadout, base: SimState, state: SimState, run: RunSummary): ArkGridEffect {
	const anchor = initSimState(loadout);
	const took = tripodsOf(loadout);
	const slots: { before: Active; after: Active; cls: string; name: string }[] = [];
	const swaps: string[] = [], partly = new Set<string>(), missing = new Set<string>();
	let reimport = false;
	const family = (id: number | null) => (id === null ? null : String(id).slice(0, 8));
	state.arkGrid.forEach((core, i) => {
		const was = base.arkGrid[i];
		if (!was) return;
		const [idA, idB] = [orderCoreOf(was), orderCoreOf(core)];
		if (idA === null && idB === null) return;
		const [pA, pB] = [simCorePoints(loadout, base, anchor, was.id), simCorePoints(loadout, state, anchor, core.id)];
		if (idA === idB && pA === pB) return;
		// Another core (not another grade) changes the rotation too: cooldowns, what triggers Destiny. Not valued.
		if (family(idA) !== family(idB)) {
			swaps.push(`${ORDER_CORES[idA ?? 0]?.name ?? 'none'} → ${ORDER_CORES[idB ?? 0]?.name ?? 'none'}`);
			return;
		}
		const before = activeEffects(idA, pA), after = activeEffects(idB, pB);
		const meta = ORDER_CORES[idB ?? idA ?? 0];
		const name = meta?.name ?? 'Order core';
		slots.push({ before, after, cls: meta?.cls ?? '', name });
		if (after.other.some((t) => !before.other.includes(t)) || before.other.some((t) => !after.other.includes(t))) partly.add(name);
	});

	// The run's buffs: Destiny buffs by their id's first five digits, states by name.
	const kept = run.skills.some((s) => s.buffs !== undefined);
	const idsOf = (key: string): number[] => {
		const ids = Object.keys(run.buffNames ?? {}).map(Number);
		if (key.startsWith('buff:')) return ids.filter((id) => `buff:${Math.floor(id / 100)}` === key);
		return ids.filter((id) => buffMatches(run.buffNames![id], key.slice(6)));
	};
	const share = (s: RunSkill, ids: number[]) => (s.damage ? Math.min(1, Math.max(0, ...ids.map((id) => s.buffs?.[id] ?? 0)) / s.damage) : 0);

	/** "Incarnation Mode": the logs keep no buff for it, but in it the class uses its Incarnation skills. */
	const modeGroup = (where: string, cls: string) => {
		const name = where.match(/^state:([A-Z][\w' ]+?) Mode$/)?.[1];
		return name && Object.values(SKILL_GROUPS[cls] ?? {}).some((g) => g.includes(name)) ? name : null;
	};
	const changedKeys = (slot: (typeof slots)[number]) => [...new Set([...slot.before.effects.keys(), ...slot.after.effects.keys()])];
	for (const slot of slots) {
		const all = [...slot.before.effects.values(), ...slot.after.effects.values()].flat();
		if (!SKILL_GROUPS[slot.cls] && all.some((e) => e.groups)) missing.add(`skill groups for ${slot.name}'s class`);
		for (const key of changedKeys(slot)) {
			const { where, portion } = splitKey(key);
			if ((portion === 'front' || portion === 'back') && !run.skills.some((s) => s.front !== undefined)) reimport = true;
			if (!where) continue;
			if (!kept) reimport = true;
			else if (!idsOf(where).length && !modeGroup(where, slot.cls) && slot.after.effects.has(key)) missing.add(where.startsWith('state:') ? `${where.slice(6)} (${slot.name})` : `${slot.name}'s Destiny buff`);
		}
	}

	const crits = critProfile(run);
	let noCrits = false;
	const factor = (s: RunSkill) => {
		let m = 1;
		for (const slot of slots) {
			const groups = SKILL_GROUPS[slot.cls]?.[s.id];
			for (const key of changedKeys(slot)) {
				const [a, b] = [slot.after.effects.get(key), slot.before.effects.get(key)];
				let ratio = bonus(a, s.id, groups, took) / bonus(b, s.id, groups, took);
				const addRate = critAdd(a, 'critRate', s.id, groups, took) - critAdd(b, 'critRate', s.id, groups, took);
				const addDamage = critAdd(a, 'critDamage', s.id, groups, took) - critAdd(b, 'critDamage', s.id, groups, took);
				if (addRate || addDamage) {
					const c = crits(s);
					if (c.multiplier) ratio *= critRatio(c.rate, c.multiplier, addRate, addDamage);
					else noCrits = true;
				}
				if (ratio === 1) continue;
				const { where, portion } = splitKey(key);
				// The part of the skill's damage the effect touches: crits, frontal / back attacks, or all of it.
				const part = !s.damage ? 0 : portion === 'crit' ? s.critDamage / s.damage
					: portion === 'front' ? (s.front ?? 0) / s.damage : portion === 'back' ? (s.back ?? 0) / s.damage : 1;
				if (!where) { m *= 1 + Math.min(1, part) * (ratio - 1); continue; }
				const ids = kept ? idsOf(where) : [];
				// Under a buff and on crits (say): taken as independent.
				if (ids.length) m *= 1 + share(s, ids) * Math.min(1, part) * (ratio - 1);
				else if (modeGroup(where, slot.cls)) m *= groups?.includes(modeGroup(where, slot.cls)!) ? 1 + Math.min(1, part) * (ratio - 1) : 1;
			}
		}
		return m;
	};
	const unvalued = [
		...(swaps.length ? [`Ark Grid: core swaps aren't valued, the clear's rotation would change (${swaps.join(', ')}). Simulate from the clear's setup to edit its own cores.`] : []),
		...(reimport ? ["Ark Grid: re-import logs to value Destiny, Deathlord Mode-like and frontal / back attack effects."] : []),
		...(missing.size ? [`Ark Grid: not in this clear's logs: ${[...missing].join(', ')}.`] : []),
		...(noCrits ? ["Ark Grid: crit effects need a clear with crit hits recorded."] : []),
		...(partly.size ? [`Ark Grid: cooldown, casting and Destiny-trigger effects of ${[...partly].join(', ')} aren't valued yet.`] : [])
	];
	return { factor, unvalued, changed: slots.length > 0 || swaps.length > 0 };
}
