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
import { ORDER_CORE_EFFECTS, ORDER_CORES, type OrderCoreEffect } from './order-cores';
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

/** Where an effect applies: always (''), under a Destiny buff ('buff:34612'), or in a state ('state:Deathlord Mode'). */
const keyOf = (e: OrderCoreEffect) => (e.feature ? `buff:${Math.floor(e.feature / 100)}` : e.when ? `state:${e.when}` : '');

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
	const top = new Map<number, number>();
	for (const e of all) if (e.feature) top.set(e.feature, Math.max(top.get(e.feature) ?? 0, e.level ?? 0));
	for (const e of all) {
		if (e.text) { out.other.push(e.text); continue; }
		if (e.feature && (e.level ?? 0) < (top.get(e.feature) ?? 0)) continue;
		const key = keyOf(e);
		out.effects.set(key, [...(out.effects.get(key) ?? []), e]);
	}
	return out;
}

const applies = (e: OrderCoreEffect, skill: number, group: string | undefined) =>
	e.skills ? e.skills.includes(skill) : e.groups === null || (group !== undefined && !!e.groups?.includes(group));
const bonus = (effects: OrderCoreEffect[] | undefined, skill: number, group: string | undefined) =>
	(effects ?? []).reduce((m, e) => (applies(e, skill, group) ? m * (1 + (e.pct ?? 0)) : m), 1);

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
		return ids.filter((id) => `state:${run.buffNames![id]}` === key);
	};
	const share = (s: RunSkill, ids: number[]) => (s.damage ? Math.min(1, Math.max(0, ...ids.map((id) => s.buffs?.[id] ?? 0)) / s.damage) : 0);

	const changedKeys = (slot: (typeof slots)[number]) => [...new Set([...slot.before.effects.keys(), ...slot.after.effects.keys()])];
	for (const slot of slots) {
		const all = [...slot.before.effects.values(), ...slot.after.effects.values()].flat();
		if (!SKILL_GROUPS[slot.cls] && all.some((e) => e.groups)) missing.add(`skill groups for ${slot.name}'s class`);
		for (const key of changedKeys(slot)) {
			if (!key) continue;
			if (!kept) reimport = true;
			else if (!idsOf(key).length && slot.after.effects.has(key)) missing.add(key.startsWith('state:') ? `${key.slice(6)} (${slot.name})` : `${slot.name}'s Destiny buff`);
		}
	}

	const factor = (s: RunSkill) => {
		let m = 1;
		for (const slot of slots) {
			const group = SKILL_GROUPS[slot.cls]?.[s.id];
			for (const key of changedKeys(slot)) {
				const ratio = bonus(slot.after.effects.get(key), s.id, group) / bonus(slot.before.effects.get(key), s.id, group);
				if (ratio === 1) continue;
				if (!key) { m *= ratio; continue; }
				const ids = kept ? idsOf(key) : [];
				if (ids.length) m *= 1 + share(s, ids) * (ratio - 1);
			}
		}
		return m;
	};
	const unvalued = [
		...(swaps.length ? [`Ark Grid: core swaps aren't valued, the clear's rotation would change (${swaps.join(', ')}). Simulate from the clear's setup to edit its own cores.`] : []),
		...(reimport ? ["Ark Grid: re-import logs to value Destiny and Deathlord Mode-like effects."] : []),
		...(missing.size ? [`Ark Grid: not in this clear's logs: ${[...missing].join(', ')}.`] : []),
		...(partly.size ? [`Ark Grid: cooldown, casting and Destiny-trigger effects of ${[...partly].join(', ')} aren't valued yet.`] : [])
	];
	return { factor, unvalued, changed: slots.length > 0 || swaps.length > 0 };
}
