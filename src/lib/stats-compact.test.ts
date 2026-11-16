import { describe, expect, it } from 'vitest';
import { compactFields, expandCounts } from './stats-compact';

const tally = (fields: string[]) => fields.reduce<Record<string, number>>((c, f) => (c[f] = (c[f] ?? 0) + 1, c), {});

describe('counter compaction', () => {
	it('rebuilds exactly the summary counters it dropped', () => {
		const full = ['upgrade_applied', 'upgrade:gem', 'insight:version:3', 'insight:model:m', 'insight:class:bard:decision',
			'insight:region:NA:decision', 'decision:mode:gold', 'decision:rank:gold:best', 'decision:choice:m:NA:bard:support:1760to1789:gold:gem:best:partial',
			'decision:comparison:3:m:NA:bard:support:1760to1789:gold:partial:standard:gem:gem:best:1to3:100to500k',
			'decision:pair:gold:gem:gem:standard', 'decision_sampled', 'sampling:attempt:m:decision', 'sampling:outcome:m:decision:sampled',
			'efficiency:10to25k', 'efficiency:gem:10to25k'];
		const kept = compactFields(full);
		expect(kept).toEqual(['upgrade_applied', 'upgrade:gem',
			'decision:comparison:3:m:NA:bard:support:1760to1789:gold:partial:standard:gem:gem:best:1to3:100to500k',
			'sampling:outcome:m:decision:sampled', 'efficiency:gem:10to25k']);
		const counts = tally(kept);
		expandCounts(counts);
		expect(counts).toEqual(tally(full));
	});
	it('leaves counters with no summary untouched', () => {
		expect(compactFields(['sim_open', 'hour:05', 'budget:cost:1to5m'])).toEqual(['sim_open', 'hour:05', 'budget:cost:1to5m']);
	});
});
