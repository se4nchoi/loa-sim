// The subset of lostark.bible's character loadout (`loadouts[i]` where `type === 'ark_passive'`)
// that the upgrade planner reads. Field names match bible's page data one-to-one, so the
// component can be handed bible's loadout object as-is.

export type BattlePointPart =
	| ({ type: number } & { value: number } & Record<string, unknown>)
	| ({ type: number } & { min: number; max: number } & Record<string, unknown>);

export interface BattlePoint {
	parts: BattlePointPart[];
	isSupport: boolean;
}

export interface ItemStat {
	type: number;
	index: number;
	id?: number;
	value: number;
	base?: boolean;
}

export interface LoadoutItem {
	id: number;
	slot: string;
	data: { type: string; stats?: ItemStat[]; [k: string]: unknown };
}

export interface ArkGridGem {
	id: number;
	idx: number;
	costReduc: number;
	corePoints: number;
	opts: { id: number; level: number }[];
}

export interface ArkGridCore {
	id: number;
	base: number;
	gems: ArkGridGem[];
}

export interface Loadout {
	type: string;
	classId: string;
	itemLevel: number;
	combatPower?: { id: number; score: number } | null;
	battlePoint: BattlePoint;
	items?: LoadoutItem[];
	gems?: { slot: number; id: number }[];
	arkGridCores?: ArkGridCore[];
	engravings?: { id: number; grade: string; progress: number }[];
	karma?: { evolution: number; enlightenment: number; leap: number };
}
