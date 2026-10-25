import { ACTIVITY_EVENTS, EXPLORATION_EVENTS, UPGRADE_CATEGORIES, type StatsReport } from '$lib/stats-model';
import { className, resolveClass } from '$lib/upgrade-planner/class-names';
import { CP_BUCKETS, LEVEL_BUCKETS, LEVEL_MILESTONES, PLAN_SECTIONS } from '$lib/plan-stats';
import { GOLD_BUCKETS, COVERAGE, BOUND_USE, BUDGET_LIMITATIONS } from '$lib/stats-insights';

const events = new Set<string>([...ACTIVITY_EVENTS, ...EXPLORATION_EVENTS].map(([event]) => event));
const planFields = new Set(['plan:count', 'plan:role:dealer', 'plan:role:support',
	...CP_BUCKETS.map(([key]) => `plan:cp:${key}`), ...LEVEL_BUCKETS.map(([key]) => `plan:level:${key}`),
	...PLAN_SECTIONS.flatMap(s=>[`plan:section:${s}`,`plan:dominant:${s}`]),'plan:dominant:none','plan:dominant:tie',
	...LEVEL_MILESTONES.map(s=>`plan:milestone:${s}`),
	...['unchanged','weapon-only','single-system','mixed'].map(s=>`plan:shape:${s}`),
	...['under20','20to24','25','sidereal'].map(s=>`plan:weapon:${s}`),...['under9','9','some10','all10'].map(s=>`plan:gems:${s}`),
	...GOLD_BUCKETS.map(s=>`budget:cost:${s}`),...COVERAGE.map(s=>`budget:coverage:${s}`),...BOUND_USE.map(s=>`budget:bound:${s}`),
	...BUDGET_LIMITATIONS.map(s=>`budget:limitation:${s}`),
	...['cp','gold'].flatMap(mode=>[`decision:mode:${mode}`,...['best','other','unpriced'].map(rank=>`decision:rank:${mode}:${rank}`)])]);

/** Explicit publication boundary: internal dimensions never become public just by adding a counter. */
export function publicStats(report: StatsReport): StatsReport {
	function counts(source: Record<string, number>) {
		const out: Record<string, number> = {};
		for (const [key, value] of Object.entries(source)) {
			if (!Number.isSafeInteger(value) || value < 0) continue;
			if (events.has(key) || planFields.has(key) || key === 'lookup:NA' || key === 'lookup:CE') out[key] = value;
			else if (key.startsWith('class:')) {
				const label = key.slice(6);
				const resolved = resolveClass(label);
				if (resolved || label === 'Other' || label === 'Unknown') {
					const canonical = resolved ? className(resolved) : 'Unknown';
					out[`class:${canonical}`] = (out[`class:${canonical}`] ?? 0) + value;
				}
			} else if (key.startsWith('upgrade:') && (UPGRADE_CATEGORIES as readonly string[]).includes(key.slice(8))) out[key] = value;
		}
		return out;
	}
	return { from: report.from, to: report.to, distinctCharacters: report.distinctCharacters,
		totals: counts(report.totals), days: report.days.map(day => ({ date: day.date,
			distinctCharacters: day.distinctCharacters, counts: counts(day.counts) })),
		updatedAt: report.updatedAt, explorationSince: report.explorationSince };
}
