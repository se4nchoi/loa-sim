// Order Ark Grid cores in the DPS meter: what a core change (another grade, more points, another core) does to each
// skill of a recorded clear. Loaded only in DPS mode (the core table is large).
//   - "Stygian Skill Damage +3%", "Damage to foes +1%": always on, so a skill of the group gets (1 + new) / (1 + old);
//   - Destiny effects ("Destiny: Footsteps of the Dead: Stygian Skill Damage +54% for 2 casts"): only the damage LOA Logs
//     recorded while that buff was up changes, by (1 + new) / (1 + old). A Destiny effect the clear never had can't
//     be placed in it, so it isn't valued (said so).
// Anything else a core does (cooldowns, meters, Deathlord Mode conditions) isn't valued yet and is named.
import type { RunSummary } from '$lib/logs/protocol';
import { ORDER_CORE_EFFECTS, ORDER_CORES, type OrderCoreEffect } from './order-cores';
import { SKILL_GROUPS } from './skill-groups';
import { initSimState, simCorePoints, type SimCore, type SimState } from './simulate';
import { swappedCoreId } from './support';
import { decodeCore } from './tables';
import type { Loadout } from './types';

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

interface Active {
	always: OrderCoreEffect[];
	/** Destiny effects by buff (the feature id's first five digits, as the log's buff ids share them). */
	destiny: Map<number, OrderCoreEffect[]>;
	/** Effects that aren't valued. */
	other: string[];
}

const buffKey = (id: number) => Math.floor(id / 100);

/** A core's effects at these points; of a Destiny feature's levels only the highest counts (it upgrades the lower). */
export function activeEffects(coreId: number | null, points: number): Active {
	const out: Active = { always: [], destiny: new Map(), other: [] };
	const core = coreId === null ? undefined : ORDER_CORES[coreId];
	if (!core) return out;
	const effects = core.bonuses.filter(([need]) => points >= need).flatMap(([, option]) => ORDER_CORE_EFFECTS[option] ?? []);
	const top = new Map<number, number>();
	for (const e of effects) if (e.feature) top.set(e.feature, Math.max(top.get(e.feature) ?? 0, e.level ?? 0));
	for (const e of effects) {
		if (e.text) out.other.push(e.text);
		else if (e.feature) {
			if ((e.level ?? 0) < (top.get(e.feature) ?? 0)) continue;
			const list = out.destiny.get(buffKey(e.feature)) ?? [];
			list.push(e);
			out.destiny.set(buffKey(e.feature), list);
		} else out.always.push(e);
	}
	return out;
}

const applies = (e: OrderCoreEffect, group: string | undefined) => e.groups === null || (group !== undefined && !!e.groups?.includes(group));
const bonus = (effects: OrderCoreEffect[], group: string | undefined) => effects.reduce((m, e) => (applies(e, group) ? m * (1 + (e.pct ?? 0)) : m), 1);

export interface ArkGridEffect {
	/** Per skill id: the multiplier on its recorded damage in this run. */
	factor: (skill: RunSummary['skills'][number]) => number;
	/** What changed but isn't valued ("Footsteps of the Dead: Stygian Skill cooldown -50% ..."). */
	unvalued: string[];
	/** Some order core changed. */
	changed: boolean;
}

/** The order core changes between the clear's setup (`base`) and the simulated one, valued on one recorded run. */
export function orderCoreEffect(loadout: Loadout, base: SimState, state: SimState, run: RunSummary): ArkGridEffect {
	const anchor = initSimState(loadout);
	const unvalued = new Set<string>();
	const slots: { before: Active; after: Active; cls: string; name: string }[] = [];
	state.arkGrid.forEach((core, i) => {
		const was = base.arkGrid[i];
		if (!was) return;
		const [idA, idB] = [orderCoreOf(was), orderCoreOf(core)];
		if (idA === null && idB === null) return;
		const [pA, pB] = [simCorePoints(loadout, base, anchor, was.id), simCorePoints(loadout, state, anchor, core.id)];
		if (idA === idB && pA === pB) return;
		const before = activeEffects(idA, pA), after = activeEffects(idB, pB);
		const meta = ORDER_CORES[idB ?? idA ?? 0];
		slots.push({ before, after, cls: meta?.cls ?? '', name: meta?.name ?? 'Order core' });
		const had = new Set(before.other);
		for (const t of after.other) if (!had.has(t)) unvalued.add(`${meta?.name}: ${t}`);
		for (const t of before.other) if (!after.other.includes(t)) unvalued.add(`${ORDER_CORES[idA ?? 0]?.name ?? meta?.name}: ${t}`);
	});
	if (!slots.length) return { factor: () => 1, unvalued: [], changed: false };

	// Damage under each Ark Grid buff in this run, per skill (by buff key); null when the import didn't keep it.
	const kept = run.skills.some((s) => s.arkGrid !== undefined);
	const seen = new Set(run.skills.flatMap((s) => Object.keys(s.arkGrid ?? {}).map((id) => buffKey(Number(id)))));
	const under = (s: RunSummary['skills'][number], key: number) =>
		Math.max(0, ...Object.entries(s.arkGrid ?? {}).filter(([id]) => buffKey(Number(id)) === key).map(([, d]) => d));

	for (const { before, after, cls, name } of slots) {
		if (!SKILL_GROUPS[cls] && [...before.always, ...after.always, ...[...before.destiny.values(), ...after.destiny.values()].flat()].some((e) => e.groups))
			unvalued.add(`${name}: skill groups for this class aren't listed yet`);
		for (const key of new Set([...before.destiny.keys(), ...after.destiny.keys()])) {
			if (!kept) unvalued.add(`${name}: Destiny effects need the logs imported again`);
			else if (!seen.has(key) && after.destiny.has(key)) unvalued.add(`${name}: a Destiny effect this clear didn't have`);
		}
	}

	const factor = (s: RunSummary['skills'][number]) => {
		let m = 1;
		for (const { before, after, cls } of slots) {
			const group = SKILL_GROUPS[cls]?.[s.id];
			m *= bonus(after.always, group) / bonus(before.always, group);
			if (!kept || !s.damage) continue;
			for (const key of new Set([...before.destiny.keys(), ...after.destiny.keys()])) {
				if (!seen.has(key)) continue;
				const ratio = bonus(after.destiny.get(key) ?? [], group) / bonus(before.destiny.get(key) ?? [], group);
				if (ratio !== 1) m *= 1 + Math.min(1, under(s, key) / s.damage) * (ratio - 1);
			}
		}
		return m;
	};
	return { factor, unvalued: [...unvalued], changed: true };
}
