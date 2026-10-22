// Mathi's content-addressed loadout API (provided 2026-10-21) uses the game's wire names and numeric slots.
// Convert at the server boundary so the clear comparison and simulator keep the same bible page-data shape.
import { isSnapshotHash, type ClearSnapshot } from './bible-data';
import { classKeyFromId } from './upgrade-planner/class-icons';
import type { ItemStat, LoadoutItem } from './upgrade-planner/types';

const SLOTS: Record<number, string> = {
	0: 'weapon', 1: 'head', 2: 'upper_body', 3: 'lower_body', 4: 'hand', 5: 'shoulder',
	6: 'neck', 7: 'ear1', 8: 'ear2', 9: 'finger1', 10: 'finger2', 11: 'ability_stone', 26: 'bracelet'
};
function unexpected(): never { throw new Error('The loadout API sent an unsupported snapshot.'); }
const record = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : unexpected();
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : unexpected();
const number = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? v : unexpected();
const integer = (v: unknown): number => Number.isInteger(number(v)) ? v as number : unexpected();

export function loadoutSnapshotUrl(hash: string): string {
	if (!isSnapshotHash(hash)) throw new Error('Unknown snapshot');
	const [version, digest] = hash.split('/');
	return `https://loadout.mathi.moe/${version}/loadouts/by-hash/${digest}`;
}

function stat(value: unknown): ItemStat {
	const s = record(value);
	return {
		type: integer(s.addon_type), index: integer(s.index), id: integer(s.tree_id), value: number(s.value),
		...(typeof s.is_base_stat === 'boolean' && typeof s.fixed !== 'boolean' ? { base: s.is_base_stat } : {}),
		...(typeof s.fixed === 'boolean' ? { fixed: s.fixed } : {})
	};
}

function item(value: unknown): LoadoutItem {
	const i = record(value), raw = record(i.item_data);
	const slot = SLOTS[integer(i.slot)];
	if (!slot || typeof raw.type !== 'string') unexpected();
	const data: LoadoutItem['data'] = { type: raw.type };
	if (raw.type === 'equipment') {
		data.stats = list(raw.rolled_stats).map(stat);
		data.honing = integer(raw.honing_level);
		data.advancedHoning = raw.advanced_honing_state == null ? 0 : integer(record(raw.advanced_honing_state).stage);
	} else if (raw.type === 'ability_stone') {
		data.engravings = list(raw.engravings).map((v) => {
			const e = record(v);
			return { id: integer(e.id), nodes: integer(e.nodes) };
		});
	} else {
		data.stats = list(raw.stats).map(stat);
	}
	return { id: integer(i.id), slot, data };
}

const node = (value: unknown) => {
	const n = record(value);
	return { id: integer(n.id), level: integer(n.level) };
};

/** Reject a changed/malformed schema before it can become a cached, partly invented gear baseline. */
export function decodeLoadoutSnapshot(body: unknown): ClearSnapshot {
	const raw = record(body), loadout = record(raw.loadout);
	if (loadout.type !== 'ark_passive') unexpected();
	const classId = classKeyFromId(integer(raw.class));
	if (!classId) unexpected();
	const cp = raw.combat_power == null ? null : record(raw.combat_power);
	const snapshot: ClearSnapshot = {
		classId,
		combatPower: cp ? { id: integer(cp.id), score: number(cp.score) } : null,
		items: list(raw.equipped_items).map(item),
		gems: list(raw.gems).map((value) => {
			const g = record(value);
			return { slot: integer(g.slot), id: integer(g.id), effects: list(g.effects).map((value) => {
				const e = record(value);
				return { type: integer(e.addon_type), id: integer(e.id), value: number(e.value) };
			}) };
		}),
		engravings: list(loadout.engravings).map((value) => {
			const e = record(value), grade = integer(e.grade);
			if (grade < 0 || grade > 6) unexpected();
			return { id: integer(e.id), grade: `engrave_grade${String(grade).padStart(2, '0')}`, progress: integer(e.progress) };
		}),
		arkPassive: Object.fromEntries(['evolution', 'enlightenment', 'leap'].map((tree) => [tree, list(loadout[`${tree}_points`]).map(node)])),
		arkGridCores: raw.ark_grid == null ? [] : list(record(raw.ark_grid).cores).map((value) => {
			const c = record(value);
			return { id: integer(c.id), base: integer(c.base_tree_id), gems: list(c.astro_gems).map((value) => {
				const g = record(value);
				// The simulator has no inactive-socket representation; do not count one as an active gem.
				if (g.active !== true) unexpected();
				return { id: integer(g.id), idx: integer(g.index), costReduc: integer(g.willpower_cost_reduction),
					corePoints: integer(g.core_points), opts: list(g.options).map(node) };
			}) };
		})
	};
	if (loadout.karma != null) {
		const levels = list(record(loadout.karma).levels).map((v) => record(v));
		const level = (id: number) => {
			const entry = levels.find((l) => l.id === id);
			return entry ? integer(entry.level) : unexpected();
		};
		snapshot.karma = { evolution: level(10000), enlightenment: level(20000), leap: level(30000) };
	}
	if (raw.equipped_cards !== undefined) snapshot.cards = list(raw.equipped_cards).map(node);
	if (raw.elixirs !== undefined) snapshot.elixirs = list(raw.elixirs);
	if (raw.transcendence !== undefined) snapshot.transcendences = list(raw.transcendence);
	return snapshot;
}
