// Messages between the page and the LOA Logs worker.

export interface EncounterRow {
	id: number;
	/** Fight start, epoch ms. */
	start: number;
	boss: string;
	difficulty: string;
	/** null on old logs that didn't record it. */
	cleared: boolean | null;
	/** The character that recorded the log. */
	player: string;
	/** ms */
	duration: number;
	/** The recording player's gear snapshot (lostark.bible), when the meter kept one. The file listing leaves it out
	 *  (LoaLogsReader.gear reads it for picked runs). */
	loadoutHash?: string | null;
}

export interface SkillShare {
	id: number;
	name: string;
	icon: string;
	/** Average share of the player's damage per run, in percent. */
	pct: number;
	/** Share of fight time the skill spent on cooldown (0–1), from LOA Logs' "time available"; unknown on old logs. */
	cooldownUse?: number;
}

/**
 * What one more of a stat would have added to the player's damage, in percent, averaged over runs. LOA Logs works these
 * out per fight from the player's inspected stats (`encounter.misc.contributionSplits`); only recent meter versions
 * save them, so `runs` counts the runs that had them.
 */
export interface StatValues {
	runs: number;
	/** Runs that contributed stat values, so skill shares use the same cohort. */
	encounterIds?: number[];
	statSamples?: Record<string, number>;
	statRanges?: Record<string, { min: number; max: number }>;
	/** Per +1 percentage point. */
	additionalDamage: number;
	critRate: number;
	critDamage: number;
	evoDamage: number;
	attackPowerPct: number;
	weaponPowerPct: number;
	/** Per +1,000 flat. */
	mainStat: number;
	weaponPower: number;
	attackPower: number;
}

export interface ReplayHit {
	skill: number;
	damage: number;
	crit: boolean;
	hyper: boolean;
	timestamp?: number;
	buffedBy?: number[];
	debuffedBy?: number[];
}
export interface ReplaySkill {
	id: number;
	name: string;
	totalDamage: number;
	hits: number;
	crits: number;
	damageGem?: number;
	cooldownGem?: number;
}
export interface ReplayRun extends EncounterRow {
	combatPower: number | null;
	loadoutHash: string | null;
	totalDamage: number;
	/** Logged hits, not reconstructed stat contexts. */
	hits: ReplayHit[];
	skills: ReplaySkill[];
	/** Aggregate all-crits / no-crits ratio; not a per-hit crit multiplier. */
	effectiveCritMultiplier: number | null;
	/** Meter recorded a nonzero Blunt Thorn contribution; its overcap conversion needs a separate model. */
	critConversion?: boolean;
	buildSpec?: string;
	arkPassives?: Record<string, { id: number; lv: number }[]>;
	meterVersion?: string;
	buffSources?: Record<number,{skill?:number;name?:string;uniqueGroup?:number}>;
}

/** One skill in one run, as the DPS tab keeps it (names and icons live once per character, in RunsBook). */
export interface RunSkill {
	id: number;
	/** Hyper Awakening damage does not follow ordinary attack/stat upgrades. Missing on older imports. */
	hyper?: boolean;
	damage: number;
	/** Damage dealt by crits. */
	critDamage: number;
	hits: number;
	crits: number;
	casts: number;
	/** ms the skill was ready but not cast; unknown on old logs. */
	timeAvailable?: number;
	/** Gem levels the meter saw on this skill. */
	damageGem?: number;
	cooldownGem?: number;
	/**
	 * Damage dealt while each of the player's Ark Grid and identity buffs was up ("Destiny: Footsteps of the Dead",
	 * "Deathlord Mode"), by buff id; the run's `buffNames` names them. Unknown on old imports.
	 */
	buffs?: Record<number, number>;
	/** Damage dealt by frontal and back attacks; unknown on old imports. */
	front?: number;
	back?: number;
}

/**
 * What a support's buffs did, by the stat that scales them: Attack Power buffs (the support's Attack Power and Ally Atk.
 * Power Enhancement), damage buffs (identity, hyper; Ally Damage Enhancement), brand (Brand Power), and the rest.
 */
export type SupportKind = 'attack' | 'damage' | 'brand' | 'other';

/** Support buff uptime (0–1): Attack Power buff, brand, identity, hyper awakening. */
export interface SupportUptime { attack: number; brand: number; identity: number; hyper: number }

/** A support's run: the party damage their buffs added, as LOA Logs attributes it. */
export interface SupportRun {
	/** Party damage the buffs added, by kind (LOA Logs' rDPS given, split by its per-effect contribution weights). */
	kinds: Record<SupportKind, number>;
	/**
	 * Each dealer buffed: class, their damage, the damage the buffs added to it by kind and by buff id, and their uptime
	 * on the support's buffs (their damage under each). Names aren't kept.
	 */
	dealers: { cls: string; damage: number; kinds: Record<SupportKind, number>; buffs?: Record<number, number>; uptime?: SupportUptime }[];
	/** Each buff's kind and the skill it comes from, by buff id (for core lines that name a skill). */
	sources?: Record<number, { kind: SupportKind; skill?: string }>;
	/** Buff uptime over the fight, as LOA Logs measured it for the party; unknown on old logs. */
	uptime?: SupportUptime;
}

/** One cleared run of the player, compact enough to keep hundreds in browser storage. */
export interface RunSummary extends EncounterRow {
	combatPower: number | null;
	itemLevel: number | null;
	spec: string | null;
	engravings: string[];
	/** Order core choices recorded by LOA Logs, not core points or astrogem stats. */
	arkGridOrder?: Partial<Record<'sun' | 'moon' | 'star', number>>;
	arkPassives?: Record<string, { id: number; lv: number }[]>;
	loadoutHash?: string;
	/** Names of the buffs in the skills' `buffs`. */
	buffNames?: Record<number, string>;
	/** The boss's HP at the end (0 on a clear), and its max; unknown on old imports. */
	bossHp?: { left: number; max: number };
	/** Players dead at the end, of how many. */
	dead?: { count: number; of: number };
	/** The run's log on lostark.bible (lostark.bible/logs/<id>), when LOA Logs synced it. */
	upstreamId?: string;
	/** A support's buff contribution; dealers don't have one. */
	support?: SupportRun;
	/** All players' damage in the fight, for this player's share of it. */
	partyDamage?: number;
	/** Sum of the player's skill damage. */
	damage: number;
	skills: RunSkill[];
	/** The meter's per-stat values for this run; null in low performance mode and on old logs. */
	statValues: StatValues | null;
	/** Meter recorded Blunt Thorn converting crit over the cap into evolution damage. */
	critConversion: boolean;
	meterVersion: string | null;
}

/** A run's build as LOA Logs kept it: gear snapshot hash, each Order core's grade (1 Epic … 4 Ancient, its tooltip's
 *  badges), spec. */
export interface RunGear {
	hash: string | null;
	order: Partial<Record<'sun' | 'moon' | 'star', number>> | null;
	spec: string | null;
}

export type LogsRequest =
	| { id: number; type: 'open'; file: File }
	| { id: number; type: 'shares'; player: string; encounterIds: number[] }
	| { id: number; type: 'statValues'; player: string; encounterIds: number[] }
	| { id: number; type: 'replay'; player: string; encounterIds: number[] }
	| { id: number; type: 'runs'; player: string; encounterIds: number[] }
	| { id: number; type: 'gear'; player: string; encounterIds: number[] };

export type LogsResponse =
	| { id: number; type: 'encounters'; encounters: EncounterRow[] }
	| { id: number; type: 'shares'; runs: number; shares: SkillShare[] }
	| { id: number; type: 'statValues'; values: StatValues | null }
	| { id: number; type: 'replay'; runs: ReplayRun[] }
	| { id: number; type: 'runs'; runs: RunSummary[]; skills: Record<number, [name: string, icon: string]> }
	| { id: number; type: 'gear'; gear: Record<number, RunGear> }
	| { id: number; type: 'error'; message: string };
