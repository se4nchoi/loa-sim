import {describe,expect,it} from 'vitest';
import {budgetSample,cleanInsight,completeUpgradeCost,decisionSample,goldBucket,insightCohort,insightFields,opportunitySample,observe,unpricedBudgetEdits} from './stats-insights';
import {UPGRADE_CATEGORIES} from './stats-model';
import type {Upgrade} from './upgrade-planner/upgrades';
import type {BudgetLine} from './upgrade-planner/sim-budget';
import type {HoningCost} from './upgrade-planner/honing-cost';
import {initSimState} from './upgrade-planner/simulate';
import type {Loadout} from './upgrade-planner/types';
import fixture from './upgrade-planner/fixtures/na-soulshan.json';

const cohort=insightCohort('souleater','na/soulshan',1784.17,false)!;
const upgrade=(key:string,category:Upgrade['category'],gainPct:number):Upgrade=>({key,category,gainPct,title:'Not transmitted',detail:'Not transmitted',count:1,approximate:false});
const gem=upgrade('gem','gem',2), acc=upgrade('acc','accessory',1), books=upgrade('books','engraving',5), rng=upgrade('core','core',20);
const rows=[gem,acc,books,rng], costs={gem:100000,acc:10000,books:900000,core:0};
const line=(extra:Partial<BudgetLine>={}):BudgetLine=>({key:'not-transmitted',title:'not-transmitted',detail:'',section:'Equipment',missing:[],average:100000,...extra});

describe('insight collection',()=>{
	it('isolates a broken observation from the product action',()=>{
		expect(observe(()=>{throw new Error('analytics failed');})).toBeUndefined();
		expect(observe(()=>true)).toBe(true);
	});
	it('distinguishes the best gold value from the biggest single-step gain under a budget',()=>{
		const sample=opportunitySample(cohort,rows,costs,{},{});
		expect(sample).toMatchObject({best:'accessory',coverage:'complete',offers:[
			{band:'100k',category:'gem',gain:'1to3'},{band:'500k',category:'gem',gain:'1to3'},{band:'1m',category:'engraving',gain:'5to10'}]});
		expect(JSON.stringify(sample)).not.toMatch(/Soulshan|not transmitted|900000/i);
	});
	it('does not treat RNG or missing prices as zero-cost opportunities',()=>{
		expect(opportunitySample(cohort,[rng],{core:0},{},{})).toBeUndefined();
		expect(opportunitySample(cohort,[gem],{},{},{})).toBeUndefined();
		const honing=upgrade('honing:weapon:25','honing',2);
		const auto={ [honing.key]:{expected:10,breakdown:{average:{materials:[{id:'stone',bought:1}],tapGold:10}}} as HoningCost };
		expect(completeUpgradeCost(honing,{[honing.key]:10},auto,{})).toBeUndefined();
		expect(completeUpgradeCost(honing,{[honing.key]:10},auto,{stone:0})).toBe(10);
		expect(completeUpgradeCost(honing,{[honing.key]:10},{},{})).toBeUndefined();
	});
	it('retains non-gold requirements on selected free raid upgrades',()=>{
		const raid={...upgrade('raid','honing',3),knownCost:0};
		expect(opportunitySample(cohort,[acc,raid],{acc:0,raid:0},{},{})).toMatchObject({best:'honing',assumption:'non-gold-materials'});
		expect(opportunitySample(cohort,[{...acc,gainPct:4},raid],{acc:0,raid:0},{},{})).toMatchObject({best:'accessory',assumption:'standard'});
		const paidRaid={...raid,knownCost:100000};
		expect(opportunitySample(cohort,[acc,paidRaid],{acc:0,raid:100000},{},{})).toMatchObject({best:'accessory',assumption:'standard'});
	});
	it('records choice versus the appropriate ranking, including ties and unpriced RNG',()=>{
		expect(decisionSample(cohort,gem,'gold',rows,costs,{},{})).toMatchObject({best:'accessory',chosen:'gem',rank:'other',gold:'100to500k'});
		expect(decisionSample(cohort,books,'cp',rows,costs,{},{})).toMatchObject({best:'core',rank:'other'});
		expect(decisionSample(cohort,rng,'gold',rows,costs,{},{})).toMatchObject({rank:'unpriced',gold:undefined});
		expect(decisionSample(cohort,acc,'gold',[gem,acc],{gem:20000,acc:10000},{},{})).toMatchObject({rank:'best'});
	});
	it('keeps partial and RNG-containing budgets out of complete-cost distributions',()=>{
		const complete=budgetSample(cohort,[line()],100,105)!;
		expect(complete).toMatchObject({coverage:'complete',gold:'100to500k',bound:'na',limitations:[]});
		const partial=budgetSample(cohort,[line(),line({status:'rng',average:undefined})],100,105)!;
		expect(partial).toMatchObject({coverage:'partial',gold:undefined,limitations:['rng']});
		expect(insightFields(partial).some(k=>k.startsWith('budget:cost:')||k.startsWith('budget:curve:'))).toBe(false);
		expect(budgetSample(cohort,[line({missing:['unset material']})],100,105)).toMatchObject({coverage:'unpriced',gold:undefined,limitations:['missing-price']});
	});
	it('excludes omitted Paradise and removed-gem costs without changing visible budget rows',()=>{
		const loadout=fixture as unknown as Loadout;
		const base=initSimState(loadout), target=structuredClone(base);
		target.gems.pop();
		target.paradise={...(base.paradise??{orb:0,powers:{0:0},k:1,flat:false}),orb:999};
		const reasons=unpricedBudgetEdits(base,target);
		expect(reasons).toEqual(['unavailable','excluded']);
		expect(budgetSample(cohort,[line()],100,105,reasons)).toMatchObject({coverage:'partial',gold:undefined,limitations:['unavailable','excluded']});
		expect(budgetSample(cohort,[],100,105,reasons)).toMatchObject({coverage:'unpriced',gold:undefined});
		expect(unpricedBudgetEdits(base,base)).toEqual([]);
	});
	it('records bound use and quality assumptions without inventory quantities',()=>{
		const sample=budgetSample(cohort,[line({qualityAssumption:true,inventory:[{id:'stone',average:100,averageBuy:10}]})],100,103)!;
		expect(sample).toMatchObject({bound:'some',assumption:'unlimited-stones'});
		expect(JSON.stringify(sample)).not.toMatch(/stone"|averageBuy|inventory/);
		expect(budgetSample(cohort,[line({inventory:[{id:'stone',average:10,averageBuy:0}]})],100,103)?.bound).toBe('all');
		expect(budgetSample(cohort,[line({sourceKey:'karma:evolution:2'})],100,103)?.assumption).toBe('non-gold-materials');
		expect(budgetSample(cohort,[line({qualityAssumption:true}),line({raidRequirement:true})],100,103)?.assumption).toBe('mixed');
	});
	it('preserves joint context for later cost-to-CP analysis',()=>{
		const fields=insightFields(budgetSample(cohort,[line()],100,105)!);
		expect(fields).toContain('budget:curve:cp-2026-10-25:NA:souleater:dealer:1760to1789:100to500k:5to10:na:standard');
		expect(fields.join()).not.toMatch(/soulshan/i);
		expect(cohort).not.toHaveProperty('name');
	});
	it('rejects arbitrary properties, invalid cohorts, duplicate budget bands and false completeness',()=>{
		const good=opportunitySample(cohort,rows,costs,{}, {})!;
		expect(cleanInsight(good,UPGRADE_CATEGORIES)).toEqual(good);
		expect(cleanInsight({...good,rawPrices:costs},UPGRADE_CATEGORIES)).toBeUndefined();
		expect(cleanInsight({...good,cohort:{...cohort,classId:'private-name'}},UPGRADE_CATEGORIES)).toBeUndefined();
		expect(cleanInsight({...good,offers:[good.offers[0],good.offers[0]]},UPGRADE_CATEGORIES)).toBeUndefined();
		const b=budgetSample(cohort,[line()],100,105)!;
		expect(cleanInsight({...b,coverage:'partial'},UPGRADE_CATEGORIES)).toBeUndefined();
		expect(cleanInsight({...b,limitations:['rng']},UPGRADE_CATEGORIES)).toBeUndefined();
	});
	it.each([[-1,undefined],[0,'zero'],[99999,'under100k'],[100000,'100to500k'],[500000,'500kto1m'],[1000000,'1to5m'],[10000000,'over10m']] as const)('bounds %s gold', (value,bucket)=>{
		expect(goldBucket(value)).toBe(bucket);
	});
});
