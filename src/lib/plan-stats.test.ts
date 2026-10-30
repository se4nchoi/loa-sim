import { describe, expect, it } from 'vitest';
import { planObservation, planSkipReason, savedPlanObservation, type PlanContext } from './plan-stats';
import type { SimState } from './upgrade-planner/simulate';
import {initSimState} from './upgrade-planner/simulate';
import fixture from './upgrade-planner/fixtures/na-soulshan.json';
import type {Loadout} from './upgrade-planner/types';
import {CP_STATS_MODEL} from './stats-versions';

const state = {gear:{head:{honing:21,advanced:40}}} as unknown as SimState;
const context: PlanContext = {state,baselineCp:100,targetCp:110,targetIlvl:1800,consistent:true,support:false};

describe('saved-plan samples', () => {
	it('records only bounded ranges and role, never gear or raw CP', () => {
		expect(planObservation(context,state)).toEqual({cp:'10to20',target:'1790to1819',role:'dealer',model:CP_STATS_MODEL});
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
		expect(planObservation({...context,targetIlvl:1730,support:true},state)).toEqual({cp:'10to20',target:'1730to1759',role:'support',model:CP_STATS_MODEL});
	});
	it('explains excluded saves and keeps the action observable while calculations settle',()=>{
		expect(planSkipReason(null,state)).toBe('no-context');
		expect(planSkipReason({...context,consistent:false,exclusion:'over-willpower'},state)).toBe('over-willpower');
		expect(planSkipReason({...context,targetIlvl:null},state)).toBe('missing-item-level');
		expect(planSkipReason({...context,targetCp:NaN},state)).toBe('invalid-values');
		expect(planSkipReason({...context,targetIlvl:9999},state)).toBe('invalid-item-level');
		expect(savedPlanObservation(context,{...state,quality:{head:99}} as SimState)).toMatchObject({plan:undefined,sampling:{kind:'plan',reason:'unsettled'}});
		expect(savedPlanObservation(context,state)).toMatchObject({plan:planObservation(context,state),sampling:{kind:'plan'}});
		expect(savedPlanObservation(context,state).sampling).not.toHaveProperty('reason');
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
