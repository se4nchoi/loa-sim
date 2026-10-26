import { CP_BUCKETS, LEVEL_BUCKETS, cpBucket, levelBucket } from './plan-stats';
import { resolveClass } from './upgrade-planner/class-names';
import type { Upgrade } from './upgrade-planner/upgrades';
import type { HoningCost, MaterialPrices } from './upgrade-planner/honing-cost';
import type { BudgetLine } from './upgrade-planner/sim-budget';
import type { SimState } from './upgrade-planner/simulate';
import { CP_STATS_MODEL } from './stats-versions';

export const GOLD_BUCKETS = ['zero','under100k','100to500k','500kto1m','1to5m','5to10m','over10m'] as const;
export const BUDGET_BANDS = ['100k','500k','1m'] as const;
export const COVERAGE = ['complete','partial','unpriced','empty'] as const;
export const BOUND_USE = ['none','some','all','na'] as const;
export type Cohort = { start: typeof LEVEL_BUCKETS[number][0]; role:'dealer'|'support'; region:'NA'|'CE'; classId:string; model:typeof CP_STATS_MODEL };
type Gain = typeof CP_BUCKETS[number][0];
type Category = Upgrade['category'];
type GoldBand = typeof GOLD_BUCKETS[number];
type Assumption = 'standard'|'unlimited-stones'|'non-gold-materials'|'mixed';
export const BUDGET_LIMITATIONS = ['rng','unavailable','excluded','missing-price'] as const;
export type BudgetSample = {kind:'budget';cohort:Cohort;coverage:typeof COVERAGE[number];bound:typeof BOUND_USE[number];assumption:Assumption;gain:Gain;gold?:GoldBand;limitations:typeof BUDGET_LIMITATIONS[number][]};
export type DecisionSample = {kind:'decision';cohort:Cohort;mode:'cp'|'gold';chosen:Category;best?:Category;rank:'best'|'other'|'unpriced';coverage:'complete'|'partial'|'unpriced';gain:Gain;gold?:GoldBand;assumption:Assumption};
export type OpportunitySample = {kind:'opportunity';cohort:Cohort;best:Category;coverage:'complete'|'partial';assumption:Assumption;offers:{band:typeof BUDGET_BANDS[number];category:Category;gain:Gain}[]};
export type InsightSample = BudgetSample | DecisionSample | OpportunitySample;

/** Analytics failure must not change the result of a product action. */
export function observe<T>(read:()=>T):T|undefined {try{return read();}catch{return undefined;}}

export function insightCohort(classId: string, characterKey: string | undefined, ilvl: number, support: boolean): Cohort | undefined {
	const region = characterKey?.split('/')[0]?.toUpperCase();
	const cls = resolveClass(classId);
	if (!cls || (region !== 'NA' && region !== 'CE') || !Number.isFinite(ilvl) || ilvl < 1500 || ilvl > 2000) return;
	return {start:levelBucket(ilvl),role:support?'support':'dealer',region,classId:cls,model:CP_STATS_MODEL};
}
export function goldBucket(value: number): GoldBand | undefined {
	if (!Number.isFinite(value) || value < 0) return;
	return value === 0 ? 'zero' : value < 1e5 ? 'under100k' : value < 5e5 ? '100to500k' : value < 1e6 ? '500kto1m'
		: value < 5e6 ? '1to5m' : value < 1e7 ? '5to10m' : 'over10m';
}
const priceable = (u: Upgrade) => u.category !== 'core' && u.category !== 'astrogem';
const assumptionFlags=(quality:boolean,resources:boolean):Assumption=>quality&&resources?'mixed':quality?'unlimited-stones':resources?'non-gold-materials':'standard';
const upgradeAssumptions=(rows:Upgrade[])=>assumptionFlags(rows.some(u=>u.category==='quality'),rows.some(u=>u.category==='karma'||(u.category==='honing'&&u.knownCost===0)));

/** Unset material prices are never interpreted as free market purchases for analytics. */
export function completeUpgradeCost(u: Upgrade, costs: Record<string,number>, auto: Record<string,HoningCost>, prices: MaterialPrices): number | undefined {
	if (!priceable(u)) return;
	const value = costs[u.key];
	if (value === undefined || goldBucket(value) === undefined) return;
	if (u.category === 'honing') {
		const cost = auto[u.key];
		if (!cost && u.knownCost === undefined) return;
		if (cost && !cost.breakdown && !u.key.startsWith('karma:')) return;
		if (cost?.breakdown?.average.materials.some(m => m.bought > 1e-6 && prices[m.id] === undefined)) return;
	}
	return value;
}
function candidates(upgrades: Upgrade[], costs: Record<string,number>, auto: Record<string,HoningCost>, prices: MaterialPrices) {
	return upgrades.flatMap(u => {
		const cost = completeUpgradeCost(u,costs,auto,prices);
		return cost === undefined || !Number.isFinite(u.gainPct) || u.gainPct <= 0 ? [] : [{u,cost,per:cost/u.gainPct}];
	}).sort((a,b)=>a.per-b.per || b.u.gainPct-a.u.gainPct);
}
export function opportunitySample(cohort: Cohort, upgrades: Upgrade[], costs: Record<string,number>, auto: Record<string,HoningCost>, prices: MaterialPrices): OpportunitySample | undefined {
	const priced = candidates(upgrades,costs,auto,prices);
	if (!priced.length) return;
	const selected: Upgrade[] = [priced[0].u];
	const offers = BUDGET_BANDS.flatMap((band,i) => {
		const best = priced.filter(p=>p.cost <= [1e5,5e5,1e6][i]).sort((a,b)=>b.u.gainPct-a.u.gainPct || a.cost-b.cost)[0];
		if (best) selected.push(best.u);
		return best ? [{band,category:best.u.category,gain:cpBucket(best.u.gainPct)}] : [];
	});
	return {kind:'opportunity',cohort,best:priced[0].u.category,offers,
		coverage:priced.length === upgrades.filter(priceable).filter(u=>u.gainPct>0).length?'complete':'partial',
		assumption:upgradeAssumptions(selected)};
}
export function decisionSample(cohort: Cohort, chosen: Upgrade, mode:'cp'|'gold', upgrades: Upgrade[], costs: Record<string,number>, auto: Record<string,HoningCost>, prices: MaterialPrices): DecisionSample | undefined {
	if (!Number.isFinite(chosen.gainPct) || chosen.gainPct <= 0) return;
	const priced = candidates(upgrades,costs,auto,prices);
	const cpBest = [...upgrades].filter(u=>Number.isFinite(u.gainPct)).sort((a,b)=>b.gainPct-a.gainPct)[0];
	const best = mode==='gold'?priced[0]?.u:cpBest;
	const cost = completeUpgradeCost(chosen,costs,auto,prices);
	const rank = mode==='gold' && (cost===undefined || !best) ? 'unpriced'
		: best && (mode==='cp' ? chosen.gainPct >= best.gainPct-1e-8 : cost!/chosen.gainPct <= priced[0].per+1e-8) ? 'best' : 'other';
	return {kind:'decision',cohort,mode,chosen:chosen.category,best:best?.category,rank,gain:cpBucket(chosen.gainPct),
		coverage:!priced.length?'unpriced':priced.length===upgrades.filter(priceable).filter(u=>u.gainPct>0).length?'complete':'partial',
		gold:cost===undefined?undefined:goldBucket(cost), assumption:upgradeAssumptions([chosen,...(best?[best]:[])])};
}
/** Unsupported edits must not make a budget look complete, even when the existing UI omits their rows. */
export function unpricedBudgetEdits(base:SimState, target:SimState): typeof BUDGET_LIMITATIONS[number][] {
	const reasons: typeof BUDGET_LIMITATIONS[number][] = [];
	if (JSON.stringify(base.paradise)!==JSON.stringify(target.paradise)) reasons.push('unavailable');
	if (target.gems.length<base.gems.length) reasons.push('excluded');
	return reasons;
}
export function budgetSample(cohort:Cohort, lines:BudgetLine[], current:number, simulated:number, unpriced:readonly typeof BUDGET_LIMITATIONS[number][]=[]): BudgetSample | undefined {
	if (!Number.isFinite(current) || !Number.isFinite(simulated) || current<=0 || simulated<=0) return;
	const good = lines.filter(l=>!l.status && l.average!==undefined && Number.isFinite(l.average) && l.average>=0 && !l.missing.length);
	const coverage = !lines.length&&!unpriced.length?'empty':good.length===lines.length&&!unpriced.length?'complete':good.length?'partial':'unpriced';
	const inventory = lines.flatMap(l=>l.inventory??[]);
	const bound = inventory.some(m=>m.average>1e-6), bought=inventory.some(m=>m.averageBuy>1e-6);
	const limitations=BUDGET_LIMITATIONS.filter(reason=>unpriced.includes(reason)||(reason==='missing-price'?lines.some(l=>!l.status&&(l.average===undefined||l.missing.length>0)):lines.some(l=>l.status===reason)));
	return {kind:'budget',cohort,coverage,bound:!inventory.length?'na':!bound?'none':bought?'some':'all',
		gain:cpBucket((simulated/current-1)*100),gold:coverage==='complete'?goldBucket(good.reduce((n,l)=>n+l.average!,0)):undefined,
		assumption:assumptionFlags(lines.some(l=>l.qualityAssumption),lines.some(l=>l.raidRequirement||l.sourceKey?.startsWith('karma:'))),limitations};
}

export interface InsightScope {
	cohort:()=>Cohort|undefined;
	unpricedBudgetEdits:()=>typeof BUDGET_LIMITATIONS[number][];
	opportunityReady:()=>boolean;
	opportunity:(sample:OpportunitySample)=>void;
	emit:(sample:InsightSample)=>void;
}

/** Enum-only validation, including nested properties. Unknown/new dimensions require an intentional schema update. */
export function cleanInsight(value:unknown, categories: readonly string[]): InsightSample | undefined {
	const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
	const one = (v:unknown, options:readonly string[]) => typeof v==='string' && options.includes(v);
	if (!object(value) || !object(value.cohort)) return;
	const c=value.cohort;
	if (Object.keys(c).some(k=>!['start','role','region','classId','model'].includes(k)) || c.model!==CP_STATS_MODEL ||
		!one(c.start,LEVEL_BUCKETS.map(([k])=>k)) || !one(c.role,['dealer','support']) || !one(c.region,['NA','CE']) ||
		typeof c.classId!=='string' || resolveClass(c.classId)!==c.classId) return;
	if (!one(value.assumption,['standard','unlimited-stones','non-gold-materials','mixed'])) return;
	const allowed = value.kind==='budget'?['coverage','bound','gain','gold','limitations'] : value.kind==='decision'?['mode','chosen','best','rank','coverage','gain','gold'] : value.kind==='opportunity'?['best','coverage','offers']:[];
	if (!allowed.length || Object.keys(value).some(k=>!['kind','cohort','assumption',...allowed].includes(k))) return;
	if (value.kind==='budget') {
		if (!one(value.coverage,COVERAGE) || !one(value.bound,BOUND_USE) || !one(value.gain,CP_BUCKETS.map(([k])=>k))) return;
		if (value.coverage==='complete' ? !one(value.gold,GOLD_BUCKETS) : value.gold!==undefined) return;
		if(!Array.isArray(value.limitations)||value.limitations.length>4||new Set(value.limitations).size!==value.limitations.length||value.limitations.some(l=>!one(l,BUDGET_LIMITATIONS)))return;
		if(value.coverage==='complete'&&value.limitations.length)return;
	} else if (value.kind==='decision') {
		if (!one(value.mode,['cp','gold']) || !one(value.chosen,categories) || !one(value.rank,['best','other','unpriced']) ||
			!one(value.coverage,['complete','partial','unpriced']) || !one(value.gain,CP_BUCKETS.map(([k])=>k)) ||
			(value.best!==undefined&&!one(value.best,categories)) || (value.gold!==undefined&&!one(value.gold,GOLD_BUCKETS))) return;
		if(value.rank==='best'&&value.best===undefined)return;
		if(value.rank==='unpriced'&&(value.mode!=='gold'||value.gold!==undefined))return;
		if(value.mode==='gold'&&value.best!==undefined&&one(value.best,['core','astrogem']))return;
		if(one(value.chosen,['core','astrogem'])&&value.gold!==undefined)return;
	} else {
		if (!one(value.best,categories) || one(value.best,['core','astrogem']) || !one(value.coverage,['complete','partial']) || !Array.isArray(value.offers) || value.offers.length>3) return;
		const bands = new Set();
		for (const offer of value.offers) {
			if (!object(offer) || Object.keys(offer).some(k=>!['band','category','gain'].includes(k)) || !one(offer.band,BUDGET_BANDS) ||
				!one(offer.category,categories) || one(offer.category,['core','astrogem']) || !one(offer.gain,CP_BUCKETS.map(([k])=>k)) || bands.has(offer.band)) return;
			bands.add(offer.band);
		}
	}
	return value as unknown as InsightSample;
}

/** Bounded daily joint distributions preserve relationships needed for later analysis. No raw user identifiers. */
export function insightFields(sample:InsightSample): string[] {
	const c=sample.cohort, cohort=`${c.model}:${c.region}:${c.classId}:${c.role}:${c.start}`;
	const common=[`insight:version:2`,`insight:model:${c.model}`,`insight:class:${c.classId}:${sample.kind}`,`insight:region:${c.region}:${sample.kind}`];
	if (sample.kind==='budget') return [...common,`budget:coverage:${sample.coverage}`,`budget:bound:${sample.bound}`,`budget:assumption:${sample.assumption}`,
		...sample.limitations.map(reason=>`budget:limitation:${reason}`),
		...(sample.gold?[`budget:cost:${sample.gold}`,`budget:curve:${cohort}:${sample.gold}:${sample.gain}:${sample.bound}:${sample.assumption}`]:[])];
	if (sample.kind==='decision') return [...common,`decision:mode:${sample.mode}`,`decision:rank:${sample.mode}:${sample.rank}`,
		`decision:choice:${cohort}:${sample.mode}:${sample.chosen}:${sample.rank}:${sample.coverage}`,
		...(sample.best?[`decision:pair:${sample.mode}:${sample.best}:${sample.chosen}:${sample.assumption}`]:[])];
	return [...common,`opportunity:best:${sample.best}`,`opportunity:coverage:${sample.coverage}`,
		...sample.offers.map(o=>`opportunity:offer:${cohort}:${o.band}:${o.category}:${o.gain}:${sample.assumption}`)];
}
