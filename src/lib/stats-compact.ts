// Keeps D1 writes down (free plan: 100k rows written per day). Many counters are summaries of one detailed counter
// recorded on the same event, e.g. decision:mode:gold can be read back out of decision:comparison:...:gold:....
// From COMPACT_FROM the server stores only the detailed counter and /stats rebuilds the summaries when it reads.
// Earlier days stored both, so they are never expanded.
export const COMPACT_FROM = '2026-11-17';

/** Summary counters that one stored counter stands for. Empty for counters that are stored as they are. */
export function derivedFields(field: string): string[] {
	const p = field.split(':');
	if (p[0] === 'decision' && p[1] === 'comparison' && p.length === 16) {
		// decision:comparison:version:model:region:class:role:start:mode:coverage:assumption:best:chosen:rank:gain:gold
		const [, , version, model, region, cls, role, start, mode, coverage, assumption, best, chosen, rank] = p;
		return [`insight:version:${version}`, `insight:model:${model}`, `insight:class:${cls}:decision`, `insight:region:${region}:decision`,
			`decision:mode:${mode}`, `decision:rank:${mode}:${rank}`,
			`decision:choice:${model}:${region}:${cls}:${role}:${start}:${mode}:${chosen}:${rank}:${coverage}`,
			...(best !== 'none' ? [`decision:pair:${mode}:${best}:${chosen}:${assumption}`] : []), 'decision_sampled'];
	}
	if (p[0] === 'opportunity' && p[1] === 'outcome' && p.length === 11) {
		// opportunity:outcome:version:model:region:class:role:start:coverage:bestAssumption:best
		const [, , version, model, region, cls, , , coverage, , best] = p;
		return [`insight:version:${version}`, `insight:model:${model}`, `insight:class:${cls}:opportunity`, `insight:region:${region}:opportunity`,
			`opportunity:best:${best}`, `opportunity:coverage:${coverage}`];
	}
	if (p[0] === 'sampling' && p[1] === 'outcome' && p.length === 5) return [`sampling:attempt:${p[2]}:${p[3]}`];
	if (p[0] === 'efficiency' && p.length === 3) return [`efficiency:${p[2]}`];
	if (p[0] === 'level' && p[1] === 'class' && p.length === 4) return [`level:${p[3]}`];
	return [];
}

/** The event's counters without those that derivedFields() rebuilds from the others. */
export function compactFields(fields: string[]): string[] {
	const drop = new Map<string, number>();
	for (const f of fields) for (const d of derivedFields(f)) drop.set(d, (drop.get(d) ?? 0) + 1);
	return fields.filter(f => {
		const left = drop.get(f) ?? 0;
		if (!left) return true;
		drop.set(f, left - 1);
		return false;
	});
}

/** Adds the rebuilt summary counters to one day's stored counts, in place. */
export function expandCounts(counts: Record<string, number>): void {
	for (const [field, value] of Object.entries(counts))
		for (const d of derivedFields(field)) counts[d] = (counts[d] ?? 0) + value;
}
