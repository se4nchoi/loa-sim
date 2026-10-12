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

export type LogsRequest =
	| { id: number; type: 'open'; file: File }
	| { id: number; type: 'shares'; player: string; encounterIds: number[] }
	| { id: number; type: 'statValues'; player: string; encounterIds: number[] };

export type LogsResponse =
	| { id: number; type: 'encounters'; encounters: EncounterRow[] }
	| { id: number; type: 'shares'; runs: number; shares: SkillShare[] }
	| { id: number; type: 'statValues'; values: StatValues | null }
	| { id: number; type: 'error'; message: string };
