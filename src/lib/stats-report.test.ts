import {describe,expect,it} from 'vitest';
import {affordableOffers,budgetCurves,choicePairs,recommendations,samplingDiagnostics} from './stats-report';
import {CP_STATS_MODEL} from './stats-versions';
import {insightCohort,insightFields,opportunitySample,decisionSample} from './stats-insights';

describe('private collection reports',()=>{
	it('pools matching budget cells while preserving model, bound use and cost assumptions',()=>{
		const prefix='budget:curve:cp-2026-10-25:';
		const rows=budgetCurves({[`${prefix}NA:souleater:dealer:1760to1789:1to5m:5to10:some:standard`]:2,[`${prefix}CE:bard:support:1730to1759:1to5m:5to10:some:standard`]:3,[`${prefix}NA:bard:support:1730to1759:1to5m:5to10:some:unlimited-stones`]:4,'budget:cost:1to5m':99,'budget:coverage:partial':100});
		expect(rows).toEqual([{dimensions:['cp-2026-10-25','1to5m','5to10','some','standard'],count:5},{dimensions:['cp-2026-10-25','1to5m','5to10','some','unlimited-stones'],count:4}]);
	});
	it('reads real collector fields without double-counting legacy aliases and filters model/coverage',()=>{
		const cohort=insightCohort('souleater','NA/test',1780,false)!;
		const rows=[{key:'gem',category:'gem',gainPct:2,title:'',detail:'',count:1,approximate:false},{key:'quality',category:'quality',gainPct:4,title:'',detail:'',count:1,approximate:false}] as const;
		const opportunity=opportunitySample(cohort,[...rows],{gem:10000,quality:200000},{},{})!;
		const decision=decisionSample(cohort,rows[1],'gold',[...rows],{gem:10000},{},{})!;
		const counts=Object.fromEntries([...insightFields(opportunity),...insightFields(decision)].map(key=>[key,3]));
		counts[`opportunity:offer-context:3:cp-2026-10-25:NA:souleater:dealer:1760to1789:complete:standard:100k:gem:1to3`]=8;
		const offers=affordableOffers(counts,CP_STATS_MODEL);
		expect(offers.map(r=>[r.dimensions[3],r.count])).toEqual([['100k',3],['1m',3],['500k',3]]);
		expect(offers.find(r=>r.dimensions[3]==='100k')?.dimensions).toEqual(['3',CP_STATS_MODEL,'complete','100k','gem','1to3','standard']);
		expect(offers.find(r=>r.dimensions[3]==='500k')?.dimensions[6]).toBe('unlimited-stones');
		expect(affordableOffers(counts,CP_STATS_MODEL,'partial')).toEqual([]);
		expect(recommendations(counts,CP_STATS_MODEL)).toEqual([{dimensions:['3',CP_STATS_MODEL,'complete','standard','gem'],count:3}]);
		expect(choicePairs(counts,CP_STATS_MODEL)).toEqual([{dimensions:['3',CP_STATS_MODEL,'gold','partial','unlimited-stones','gem','quality','unpriced','3to5','unpriced'],count:3}]);
		expect(choicePairs(counts,CP_STATS_MODEL,'complete')).toEqual([]);
		expect(choicePairs({'decision:pair:gold:quality:gem:unlimited-stones':100})).toEqual([]);
	});
	it('reconciles diagnostics separately from legacy totals and surfaces unmatched attempts',()=>{
		const counts={upgrade_applied:1000,[`sampling:attempt:${CP_STATS_MODEL}:decision`]:10,
			[`sampling:outcome:${CP_STATS_MODEL}:decision:sampled`]:7,[`sampling:outcome:${CP_STATS_MODEL}:decision:unsettled`]:2,
			[`sampling:outcome:${CP_STATS_MODEL}:decision:baseline-mismatch`]:1};
		expect(samplingDiagnostics(counts)).toMatchObject([{model:CP_STATS_MODEL,kind:'decision',attempts:10,sampled:7,excluded:3,difference:0}]);
		expect(samplingDiagnostics({...counts,[`sampling:attempt:${CP_STATS_MODEL}:decision`]:12})[0].difference).toBe(2);
		expect(samplingDiagnostics({upgrade_applied:1000})).toEqual([]);
	});
	it('does not invent samples from missing or malformed counters',()=>{
		expect(budgetCurves({})).toEqual([]);
		expect(affordableOffers({'opportunity:offer:bad':4})).toEqual([]);
		expect(choicePairs({'decision:pair:gold:quality:gem:standard':NaN,'decision:pair:gold:gem:gem:standard':-1,'decision:pair:gold:unknown:gem:standard':5})).toEqual([]);
	});
});
