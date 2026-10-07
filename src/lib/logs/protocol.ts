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
}

export type LogsRequest =
	| { id: number; type: 'open'; file: File }
	| { id: number; type: 'shares'; player: string; encounterIds: number[] };

export type LogsResponse =
	| { id: number; type: 'encounters'; encounters: EncounterRow[] }
	| { id: number; type: 'shares'; runs: number; shares: SkillShare[] }
	| { id: number; type: 'error'; message: string };
