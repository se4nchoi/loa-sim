import { describe, expect, it } from 'vitest';
import { planObservation, type PlanContext } from './plan-stats';
import type { SimState } from './upgrade-planner/simulate';
import {initSimState} from './upgrade-planner/simulate';
import fixture from './upgrade-planner/fixtures/na-soulshan.json';
import type {Loadout} from './upgrade-planner/types';

const state = {gear:{head:{honing:21,advanced:40}}} as unknown as SimState;
const context: PlanContext = {state,baselineCp:100,targetCp:110,targetIlvl:1800,consistent:true,support:false};

describe('saved-plan samples', () => {
	it('records only bounded ranges and role, never gear or raw CP', () => {
		expect(planObservation(context,state)).toEqual({cp:'10to20',target:'1790to1819',role:'dealer'});
	});
	it.each([[99,'lower'],[100,'same'],[100.5,'under1'],[101,'1to3'],[103,'3to5'],[105,'5to10'],[110,'10to20'],[120,'over20']] as const)('bins %s CP without floating-point boundary drift', (targetCp,cp) => {
		expect(planObservation({...context,targetCp},state)?.cp).toBe(cp);
	});
	it('rejects stale, mismatched, missing, and invalid calculations', () => {
		expect(planObservation(context,{...state,quality:{head:100}} as SimState)).toBeUndefined();
		expect(planObservation({...context,consistent:false},state)).toBeUndefined();
		expect(planObservation({...context,targetIlvl:null},state)).toBeUndefined();
		expect(planObservation({...context,targetCp:Infinity},state)).toBeUndefined();
		expect(planObservation(null,state)).toBeUndefined();
	});
	it('bins progression boundaries and support independently', () => {
		expect(planObservation({...context,targetIlvl:1730,support:true},state)).toEqual({cp:'10to20',target:'1730to1759',role:'support'});
	});
	it('distinguishes weapon-only plans and records the strongest standalone changed system',()=>{
		const base=initSimState(fixture as unknown as Loadout), target=structuredClone(base);
		target.gear.weapon!.honing=target.gear.weapon!.honing===25?24:25;
		const c={...context,state:target,base,startIlvl:1784,contributions:{gear:{pct:5}}};
		expect(planObservation(c,target)).toMatchObject({start:'1760to1789',sections:['gear'],dominant:'gear',shape:'weapon-only',milestones:['1790','1800']});
		target.gems[0].level=target.gems[0].level===10?9:10;
		expect(planObservation({...c,contributions:{gear:{pct:5},gems:{pct:8}}},target)).toMatchObject({sections:['gear','gems'],dominant:'gems',shape:'mixed'});
		expect(planObservation({...c,contributions:{gear:{pct:5},gems:{pct:5}}},target)?.dominant).toBe('tie');
	});
});
