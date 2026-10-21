import type { ClearSnapshot } from './bible-data';
import { classKeyForNumber } from './upgrade-planner/class-icons';
import type { ItemStat } from './upgrade-planner/types';

const SLOTS: Record<number, string> = {0: 'weapon', 1: 'head', 2: 'upper_body', 3: 'lower_body', 4: 'hand',
	5: 'shoulder', 6: 'neck', 7: 'ear1', 8: 'ear2', 9: 'finger1', 10: 'finger2', 11: 'ability_stone', 26: 'bracelet'};
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => {
	if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid loadout response');
	return v as Obj;
};
const num = (v: unknown): number => {
	if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Invalid loadout number');
	return v;
};
const rows = (v: unknown): Obj[] => {
	if (!Array.isArray(v)) throw new Error('Invalid loadout collection');
	return v.map(obj);
};
const stats = (v: unknown): ItemStat[] => rows(v).map((s) => ({type: num(s.addon_type), index: num(s.index),
	value: num(s.value), ...(s.tree_id === undefined ? {} : {id: num(s.tree_id)}), base: s.is_base_stat === true}));

/** Mathi's documented raw v3 endpoint; preserve the raw record for fields not yet modeled. */
export function decodeMathiLoadout(body: unknown): ClearSnapshot {
	const raw = obj(body), build = obj(raw.loadout);
	const classId = classKeyForNumber(num(raw.class));
	if (!classId) throw new Error('This snapshot has an unsupported class');
	const items = rows(raw.equipped_items).map((i) => {
		const data = obj(i.item_data), slotId = num(i.slot);
		if (typeof data.type !== 'string') throw new Error('Invalid loadout item');
		return {id: num(i.id), slot: SLOTS[slotId] ?? `unknown:${slotId}`, data: {
			...data, type: data.type,
			...(data.rolled_stats === undefined && data.stats === undefined ? {} : {stats: stats(data.rolled_stats ?? data.stats)}),
			...(data.honing_level === undefined ? {} : {honing: num(data.honing_level)}),
			...(data.advanced_honing_state == null ? {} : {advancedHoning: num(obj(data.advanced_honing_state).stage)}),
			...(data.engravings === undefined ? {} : {engravings: rows(data.engravings).map((e) => ({id: num(e.id), nodes: num(e.nodes)}))})
		}};
	});
	const arkPassive = Object.fromEntries(['evolution', 'enlightenment', 'leap'].map((tree) =>
		[tree, rows(build[`${tree}_points`] ?? []).map((p) => ({id: num(p.id), level: num(p.level)}))]));
	const karma = rows(build.karma == null ? [] : obj(build.karma).levels);
	const power = raw.combat_power == null ? null : obj(raw.combat_power);
	return {classId, items, arkPassive,
		combatPower: power ? {id: num(power.id), score: num(power.score)} : null,
		gems: rows(raw.gems ?? []).map((g) => ({id: num(g.id), slot: num(g.slot), effects: rows(g.effects ?? []).map((e) =>
			({type: num(e.addon_type), id: num(e.id), value: num(e.value)}))})),
		engravings: rows(build.engravings ?? []).map((e) => ({id: num(e.id), grade: `engrave_grade${String(num(e.grade)).padStart(2, '0')}`, progress: num(e.progress)})),
		...(karma.length ? {karma: {evolution: num(karma.find((k) => k.id === 10000)?.level),
			enlightenment: num(karma.find((k) => k.id === 20000)?.level), leap: num(karma.find((k) => k.id === 30000)?.level)}} : {}),
		arkGridCores: rows(raw.ark_grid == null ? [] : obj(raw.ark_grid).cores).map((c) => ({id: num(c.id), base: num(c.base_tree_id),
			gems: rows(c.astro_gems ?? []).map((g) => ({id: num(g.id), idx: num(g.index), corePoints: num(g.core_points), costReduc: num(g.willpower_cost_reduction),
				opts: rows(g.options ?? []).map((o) => ({id: num(o.id), level: num(o.level)}))}))})),
		cards: raw.equipped_cards, elixirs: raw.elixirs, transcendences: raw.transcendence, raw
	};
}
