// Shared reporting labels and bounded dimensions. No server code or secrets in client bundles.
import type { PlanObservation } from './plan-stats';
import type { InsightSample } from './stats-insights';
import type { SamplingAttempt } from './stats-sampling';
export const ACTIVITY_EVENTS = [
	['lookup', 'Character loads'], ['sim_open', 'Simulator opens'], ['build_saved', 'Builds saved'],
	['share_created', 'Shares created'], ['share_opened', 'Share requests']
] as const;

export const EXPLORATION_EVENTS = [
	['budget_opened', 'Budgets opened'], ['upgrade_applied', 'Upgrades applied'], ['build_imported', 'Builds imported'],
	['opportunity_sampled','Recommendation samples'],['budget_sampled','Budget samples'],['decision_sampled','Upgrade choices sampled'],
	['sample_skipped','Excluded samples'],['budget_closed','Budgets closed'],['budget_abandoned','Budgets unmounted']
] as const;

export const UPGRADE_CATEGORIES = ['honing', 'quality', 'gem', 'core', 'astrogem', 'engraving', 'accessory', 'karma', 'skin'] as const;
export type UpgradeCategory = typeof UPGRADE_CATEGORIES[number];
export type ClientStatsEvent = 'lookup' | 'lookup_fail' | 'sim_open' | 'build_saved' | typeof EXPLORATION_EVENTS[number][0];
export interface CountEvent {
	event: ClientStatsEvent | 'share_created' | 'share_opened';
	region?: string;
	name?: string;
	class?: string;
	id?: string;
	source?: 'remote' | 'paste';
	category?: UpgradeCategory;
	plan?: PlanObservation;
	insight?: InsightSample;
	sampling?: SamplingAttempt;
	v?: 2 | 3;
}
export interface StatsDay { date: string; distinctCharacters: number; counts: Record<string, number> }
export interface StatsReport {
	/** Historical HLL estimates and new exact counts may overlap across the storage migration. */
	legacyDistinct?: boolean;
	from: string;
	to: string;
	distinctCharacters: number;
	totals: Record<string, number>;
	days: StatsDay[];
	updatedAt?: string;
	explorationSince?: string | null;
}

/** Old Other counts stay visible without pretending to recover the missing classes. */
export function statsBreakdown(totals: Record<string, number>, prefix: string): [string, number][] {
	const rows = new Map<string, number>();
	for (const [key, value] of Object.entries(totals)) {
		if (!key.startsWith(prefix)) continue;
		const label = key.slice(prefix.length);
		const name = prefix === 'class:' && ['Other', 'Unknown'].includes(label) ? 'Unknown class' : label;
		rows.set(name, (rows.get(name) ?? 0) + value);
	}
	return [...rows].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
