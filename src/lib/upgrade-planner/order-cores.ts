// Order Ark Grid cores: per item id, the class, name and bonuses (core points needed, option id); per option id, its
// effects parsed for the DPS meter. The data is baked per class into order-cores/<class>.ts by
// scripts/bake-order-cores.mjs (see the script for what each shape means) and loaded one class at a time: a character
// only ever needs its own class's 18 cores.
export interface OrderCoreEffect {
	pct?: number;
	/** Unsupported stack / timer windows: value the named damage at full stacks or full uptime. */
	assumed?: 'max-stacks' | 'full-uptime';
	/** Explicit cap from the option; pct already includes it for a per-stack bonus. */
	stacks?: number;
	/** Only at the cap ("At max stacks, Timeline Collapse Damage +20%"): pct is the whole bonus. */
	atMax?: true;
	/** Skill groups the damage applies to; null = every skill. */
	groups?: string[] | null;
	/** And/or these skills (ids). */
	skills?: number[];
	/** Skills left out ("excluding Hyper Awakening Technique", "excluding Last Request"). */
	except?: number[];
	/** Only with this tripod on the effect's skills ("Possession" on Gluttony): checked against the character's skills. */
	tripod?: string;
	/** A Crit Rate / Crit Damage change (pct in percentage points) instead of a damage multiplier. */
	stat?: 'critRate' | 'critDamage';
	/** On crit hits only: valued on the crit share of the damage. */
	crit?: boolean;
	/** Frontal or back attacks only: valued on the logged front/back attack damage. */
	position?: 'front' | 'back';
	/** Only while in this state ("Deathlord Mode", "Brawl King Stance", "Possession"): valued on the damage the logs
	 *  recorded under the player's buff of that name. */
	when?: string;
	/** A Destiny effect: the ability feature and its level, and the buff's name when the effect names it (the logs
	 *  record the buff under that name: "Destiny: Footsteps of the Dead"). */
	buff?: string;
	feature?: number;
	level?: number;
	/** Not valued: the option's own words. */
	text?: string;
}

/** One class's baked cores (order-cores/<class>.ts). */
export interface OrderCoreData {
	cores: Record<number, { name: string; bonuses: [points: number, option: number][] }>;
	effects: Record<number, OrderCoreEffect[]>;
	/** Tripod names by tier, for the skills tripod effects name (a character's skills pick one per tier, 1-based). */
	tiers: Record<number, string[][]>;
}

// Filled by loadOrderCores: empty until a class has loaded, so read them only after awaiting it.
export const ORDER_CORES: Record<number, { cls: string; name: string; bonuses: [points: number, option: number][] }> = {};
export const ORDER_CORE_EFFECTS: Record<number, OrderCoreEffect[]> = {};
export const TRIPOD_TIERS: Record<number, string[][]> = {};

const files = import.meta.glob<{ default: OrderCoreData }>('./order-cores/*.ts');
/** bible's class ids and the game's differ only in underscores ("soul_eater" / "souleater"). */
const keyOf = (cls: string) => cls.replaceAll('_', '').toLowerCase();
const classes = new Map(Object.entries(files).map(([path, load]) => { const cls = path.slice(path.lastIndexOf('/') + 1, -3); return [keyOf(cls), { cls, load }]; }));
const loading = new Map<string, Promise<void>>();

function loadClass(key: string): Promise<void> {
	let pending = loading.get(key);
	if (!pending) {
		const { cls, load } = classes.get(key)!;
		pending = load().then(({ default: data }) => {
			for (const [id, core] of Object.entries(data.cores)) ORDER_CORES[Number(id)] = { cls, ...core };
			Object.assign(ORDER_CORE_EFFECTS, data.effects);
			Object.assign(TRIPOD_TIERS, data.tiers);
		});
		// A failed download (offline, a new deploy) can be tried again.
		pending.catch(() => loading.delete(key));
		loading.set(key, pending);
	}
	return pending;
}

/** Loads a class's cores into the tables above; every class when the class isn't given or isn't one we know. */
export async function loadOrderCores(classId?: string): Promise<void> {
	const key = classId ? keyOf(classId) : '';
	await Promise.all((classes.has(key) ? [key] : [...classes.keys()]).map(loadClass));
}
