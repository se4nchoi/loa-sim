// The subset of lostark.bible's character loadout (`loadouts[i]` where `type === 'ark_passive'`)
// that the upgrade planner reads. Field names match bible's page data one-to-one, so the
// component can be handed bible's loadout object as-is.

/** A part has either `value`, or a `min`/`max` range (pet specialty). Other fields vary by type. */
export interface BattlePointPart {
	type: number;
	value?: number;
	min?: number;
	max?: number;
	[field: string]: unknown;
}

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
	/** Equipped gems; `effects` carries the skill: type 5 = damage gem, type 27 = cooldown gem (id = skill id). */
	gems?: { slot: number; id: number; effects?: { type: number; id: number; value: number }[] }[];
	arkGridCores?: ArkGridCore[];
	engravings?: { id: number; grade: string; progress: number }[];
	/** Karma levels (1–30) per ark passive tree. */
	karma?: { evolution: number; enlightenment: number; leap: number };
	/** Character stat totals; `type` is the stat index (3/4/5 = Str/Dex/Int, 15/16/18 = Crit/Spec/Swift). */
	stats?: { type: number; value: number }[];
}
