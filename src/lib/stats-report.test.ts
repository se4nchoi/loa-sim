import {describe,expect,it} from 'vitest';
import {affordableOffers,budgetCurves,choicePairs} from './stats-report';

describe('private collection reports',()=>{
	it('pools matching budget cells while preserving model, bound use and cost assumptions',()=>{
		const prefix='budget:curve:cp-2026-10-25:';
		const rows=budgetCurves({[`${prefix}NA:souleater:dealer:1760to1789:1to5m:5to10:some:standard`]:2,[`${prefix}CE:bard:support:1730to1759:1to5m:5to10:some:standard`]:3,[`${prefix}NA:bard:support:1730to1759:1to5m:5to10:some:unlimited-stones`]:4,'budget:cost:1to5m':99,'budget:coverage:partial':100});
		expect(rows).toEqual([{dimensions:['cp-2026-10-25','1to5m','5to10','some','standard'],count:5},{dimensions:['cp-2026-10-25','1to5m','5to10','some','unlimited-stones'],count:4}]);
	});
	it('keeps budget ceilings separate and does not count opportunity totals as offers',()=>{
		const counts={'opportunity:offer:cp-2026-10-25:NA:souleater:dealer:1760to1789:100k:gem:under1:standard':3,'opportunity:offer:cp-2026-10-25:NA:souleater:dealer:1760to1789:500k:gem:under1:standard':3,opportunity_sampled:3,'opportunity:best:gem':3};
		expect(affordableOffers(counts).map(r=>[r.dimensions[1],r.count])).toEqual([['100k',3],['500k',3]]);
	});
	it('preserves recommendation-to-choice direction and ranking mode',()=>{
		expect(choicePairs({'decision:pair:gold:quality:gem:unlimited-stones':7,'decision:pair:cp:gem:quality:standard':2,'decision:rank:gold:best':200})).toEqual([{dimensions:['gold','quality','gem','unlimited-stones'],count:7},{dimensions:['cp','gem','quality','standard'],count:2}]);
	});
	it('does not invent samples from missing or malformed counters',()=>{
		expect(budgetCurves({})).toEqual([]);
		expect(affordableOffers({'opportunity:offer:bad':4})).toEqual([]);
		expect(choicePairs({'decision:pair:gold:quality:gem:standard':NaN,'decision:pair:gold:gem:gem:standard':-1,'decision:pair:gold:unknown:gem:standard':5})).toEqual([]);
	});
});
