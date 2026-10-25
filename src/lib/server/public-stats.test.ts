import { describe, expect, it } from 'vitest';
import { publicStats } from './public-stats';
import type { StatsReport } from '$lib/stats-model';

describe('public stats publication boundary', () => {
	it('publishes simulator aggregates without internal diagnostics or arbitrary dimensions', () => {
		const counts = { lookup: 12, sim_open: 10, budget_opened: 3, 'class:Souleater': 5,
			'class:Other': 2, 'class:Unknown': 1, 'lookup:NA': 12, 'upgrade:gem': 4,
			lookup_fail: 9, 'unknown:missing': 2, 'source:remote': 8, 'class:private-name': 1,
			'upgrade:private-data': 1, 'arbitrary:secret': 99 };
		const raw = { from: '2026-10-20', to: '2026-10-25', distinctCharacters: 8,
			totals: counts, days: [{date: '2026-10-25', distinctCharacters: 8, counts}] } satisfies StatsReport;
		const result = publicStats(raw);
		expect(result.totals).toEqual({lookup: 12, sim_open: 10, budget_opened: 3,
			'class:Souleater': 5, 'class:Unknown': 3, 'lookup:NA': 12, 'upgrade:gem': 4});
		expect(result.days[0].counts).toEqual(result.totals);
		expect(raw.totals['class:Other']).toBe(2);
		expect(JSON.stringify(result)).not.toMatch(/secret|private-name|lookup_fail|unknown:missing/);
	});
	it('excludes invalid counter values', () => {
		const result = publicStats({from:'2026-10-25',to:'2026-10-25',distinctCharacters:0,
			days:[],totals:{lookup:-1,sim_open:NaN,build_saved:1.5}});
		expect(result.totals).toEqual({});
	});
	it('publishes only approved plan ranges rather than arbitrary plan properties',()=>{
		const result=publicStats({from:'2026-10-25',to:'2026-10-25',distinctCharacters:0,days:[],totals:{
			'plan:count':2,'plan:cp:10to20':1,'plan:level:1790to1819':1,'plan:role:dealer':2,'plan:name:someone':1,'plan:cp:secret':1}});
		expect(result.totals).toEqual({'plan:count':2,'plan:cp:10to20':1,'plan:level:1790to1819':1,'plan:role:dealer':2});
	});
});
