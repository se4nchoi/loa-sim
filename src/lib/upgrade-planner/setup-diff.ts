// What differs between the gear being simulated and the gear a clear was played with (its lostark.bible snapshot).
// Players often keep a CP setup and a raid setup: the same honing, gems and accessories, but another Enlightenment
// build, Ark Grid cores or Paradise orb. Gear the same means the meter's gear edits are valued on the right gear.
import type { ClearSnapshot } from '$lib/bible-data';
import { ARK_PASSIVE_NODES } from './ark-passive-names';
import { CORE_NAMES } from './game-data';
import type { Loadout } from './types';

export interface SetupDiff {
	/** Gear slots that differ ("Weapon", "Earring 1"); empty when all match. */
	gear: string[];
	/** The gems differ (levels, kinds or skills). */
	gems: boolean;
	/** Ark Grid cores that differ, by name: the clear's and the simulated ones. */
	cores: { clear: string[]; now: string[] } | null;
	/** Ark Passive trees that differ, with the named nodes only one side takes ("Full Moon Harvester"). */
	passives: { tree: string; clear: string[]; now: string[] }[];
	/** Other parts that differ: "Engravings", "Karma", "Cards", "Elixirs", "Transcendence". */
	other: string[];
}

const SLOTS: Record<string, string> = {
	weapon: 'Weapon', head: 'Head', shoulder: 'Shoulder', upper_body: 'Chest', lower_body: 'Pants', hand: 'Gloves',
	neck: 'Necklace', ear1: 'Earring 1', ear2: 'Earring 2', finger1: 'Ring 1', finger2: 'Ring 2', ability_stone: 'Ability Stone', bracelet: 'Bracelet'
};
const TREES: Record<string, string> = { evolution: 'Evolution', enlightenment: 'Enlightenment', leap: 'Leap' };
const json = (v: unknown) => JSON.stringify(v ?? null);
/** Order-free comparison of two lists. */
const sameList = (a: unknown[] | undefined | null, b: unknown[] | undefined | null) => json((a ?? []).map(json).sort()) === json((b ?? []).map(json).sort());

const coreName = (id: number) => CORE_NAMES[String(id).slice(0, 8)] ?? `Core ${id}`;

export function setupDiff(loadout: Loadout, clear: ClearSnapshot): SetupDiff {
	// Gear: only slots both sides have (a snapshot can lack newer slots).
	const now = new Map((loadout.items ?? []).map((i) => [i.slot, i]));
	const gear = (clear.items ?? []).flatMap((item) => {
		const mine = now.get(item.slot);
		if (!mine || !SLOTS[item.slot]) return [];
		return json({ id: item.id, data: item.data }) === json({ id: mine.id, data: mine.data }) ? [] : [SLOTS[item.slot]];
	});

	const gems = !sameList((clear.gems ?? []).map((g) => ({ id: g.id, effects: g.effects })), (loadout.gems ?? []).map((g) => ({ id: g.id, effects: g.effects })));

	const coreIds = (cores: Loadout['arkGridCores']) => (cores ?? []).map((c) => c.id);
	const clearCores = coreIds(clear.arkGridCores), nowCores = coreIds(loadout.arkGridCores);
	const cores = sameList(clear.arkGridCores, loadout.arkGridCores) ? null : {
		clear: clearCores.filter((id) => !nowCores.includes(id)).map(coreName),
		now: nowCores.filter((id) => !clearCores.includes(id)).map(coreName)
	};

	// Ark Passive: per tree, the named nodes (past the first tier) that only one side takes; level changes count too.
	const passivesNow = (loadout as Loadout & { arkPassive?: ClearSnapshot['arkPassive'] }).arkPassive ?? {};
	const passivesClear = clear.arkPassive ?? {};
	const passives = Object.keys(TREES).flatMap((tree) => {
		const a = passivesClear[tree] ?? [], b = passivesNow[tree] ?? [];
		if (sameList(a, b)) return [];
		const ids = (list: { id: number }[]) => new Set(list.map((n) => n.id));
		const named = (list: { id: number }[], other: Set<number>) =>
			list.filter((n) => !other.has(n.id) && (ARK_PASSIVE_NODES[n.id]?.[1] ?? 0) >= 1).map((n) => ARK_PASSIVE_NODES[n.id]?.[0] ?? `Node ${n.id}`);
		return [{ tree: TREES[tree], clear: named(a, ids(b)), now: named(b, ids(a)) }];
	});

	const extra = loadout as Loadout & Record<string, unknown>;
	const other = ([['engravings', 'Engravings'], ['karma', 'Karma'], ['cards', 'Cards'], ['elixirs', 'Elixirs'], ['transcendences', 'Transcendence']] as const)
		.filter(([key]) => (clear as Record<string, unknown>)[key] !== undefined && extra[key] !== undefined)
		.filter(([key]) => {
			const a = (clear as Record<string, unknown>)[key], b = extra[key];
			return Array.isArray(a) && Array.isArray(b) ? !sameList(a, b) : json(a) !== json(b);
		})
		.map(([, label]) => label);

	return { gear, gems, cores, passives, other };
}

/** Gear, gems and accessories match: the meter's gear edits are valued on the gear of the clear. */
export const sameGear = (d: SetupDiff) => !d.gear.length && !d.gems;
