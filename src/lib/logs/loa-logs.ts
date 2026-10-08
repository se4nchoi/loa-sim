// Page-side client for the LOA Logs worker, plus the time-range presets.

import type { EncounterRow, LogsRequest, LogsResponse, SkillShare } from './protocol';

export type { EncounterRow, SkillShare };

/** A request without its correlation id (distributes over the union). */
type Outgoing<T> = T extends unknown ? Omit<T, 'id'> : never;

export class LoaLogsReader {
	private worker: Worker;
	private nextId = 1;
	private pending = new Map<number, (r: LogsResponse) => void>();

	constructor() {
		this.worker = new Worker(new URL('./logs-worker.ts', import.meta.url), { type: 'module' });
		this.worker.onmessage = (e: MessageEvent<LogsResponse>) => {
			this.pending.get(e.data.id)?.(e.data);
			this.pending.delete(e.data.id);
		};
	}

	private send<T extends LogsResponse['type']>(req: Outgoing<LogsRequest>): Promise<Extract<LogsResponse, { type: T }>> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, (r) => (r.type === 'error' ? reject(new Error(r.message)) : resolve(r as Extract<LogsResponse, { type: T }>)));
			this.worker.postMessage({ ...req, id } as LogsRequest);
		});
	}

	async open(file: File): Promise<EncounterRow[]> {
		return (await this.send<'encounters'>({ type: 'open', file })).encounters;
	}

	async shares(player: string, encounterIds: number[]): Promise<{ runs: number; shares: SkillShare[] }> {
		const r = await this.send<'shares'>({ type: 'shares', player, encounterIds });
		return { runs: r.runs, shares: r.shares };
	}

	close() {
		this.worker.terminate();
	}
}

// ---------------------------------------------------------------------------------------------
// Time ranges. NA/EU weekly reset: Wednesday 10:00 UTC.

const WEEK = 7 * 24 * 3600 * 1000;

export function lastReset(now = Date.now()): number {
	const d = new Date(now);
	const daysSinceWed = (d.getUTCDay() - 3 + 7) % 7;
	let reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceWed, 10);
	if (reset > now) reset -= WEEK;
	return reset;
}

export type RangePreset = 'this-week' | 'last-week' | 'last-2-weeks' | 'last-3-weeks' | 'last-4-weeks' | 'all';

export const RANGE_LABELS: Record<RangePreset, string> = {
	'this-week': 'This week',
	'last-week': 'Last week',
	'last-2-weeks': 'Last 2 weeks',
	'last-3-weeks': 'Last 3 weeks',
	'last-4-weeks': 'Last 4 weeks',
	all: 'All time'
};

/** [from, to) in epoch ms for a preset. "Last N weeks" means the current week plus N−1 before it. */
export function rangeOf(preset: RangePreset, now = Date.now()): [number, number] {
	const reset = lastReset(now);
	switch (preset) {
		case 'this-week':
			return [reset, Infinity];
		case 'last-week':
			return [reset - WEEK, reset];
		case 'last-2-weeks':
			return [reset - WEEK, Infinity];
		case 'last-3-weeks':
			return [reset - 2 * WEEK, Infinity];
		case 'last-4-weeks':
			return [reset - 3 * WEEK, Infinity];
		default:
			return [0, Infinity];
	}
}
